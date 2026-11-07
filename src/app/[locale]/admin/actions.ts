"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getAdminUser } from "@/lib/auth/dal";
import { normalizeReportIdentifier } from "@/lib/identifiers/normalize";
import { createClient } from "@/lib/supabase/server";

/**
 * Moderation actions. All run as the signed-in admin (RLS admin policies +
 * column grants), not with the service role.
 */
const resolveSchema = z.object({ flagId: z.uuid(), action: z.enum(["dismiss", "hide"]) });

export async function resolveFlag(input: unknown): Promise<ActionResult> {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const admin = await getAdminUser();
  if (!admin) return fail("forbidden");

  const supabase = await createClient();
  const { data: flag } = await supabase
    .from("flags")
    .select("identifier_id")
    .eq("id", parsed.data.flagId)
    .maybeSingle();
  if (!flag) return fail("notFound");

  if (parsed.data.action === "hide") {
    const { error } = await supabase
      .from("identifiers")
      .update({ hidden: true })
      .eq("id", flag.identifier_id);
    if (error) return fail("unavailable");
  }
  // Resolving one flag on an entry resolves all its open flags.
  const { error } = await supabase
    .from("flags")
    .update({
      status: parsed.data.action === "hide" ? "actioned" : "dismissed",
      resolved_by: admin.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("identifier_id", flag.identifier_id)
    .eq("status", "open");
  if (error) return fail("unavailable");
  revalidatePath("/[locale]/admin", "page");
  return ok(undefined);
}

const hiddenSchema = z.object({ identifierId: z.uuid(), hidden: z.boolean() });

export async function setHidden(input: unknown): Promise<ActionResult> {
  const parsed = hiddenSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  if (!(await getAdminUser())) return fail("forbidden");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("identifiers")
    .update({ hidden: parsed.data.hidden })
    .eq("id", parsed.data.identifierId)
    .select("id");
  if (error || !data?.length) return fail(error ? "unavailable" : "notFound");
  return ok(undefined);
}

const mergeSchema = z.object({
  sourceId: z.uuid(),
  targetType: z.enum(["phone", "upi", "url", "email", "social", "bank_ifsc"]),
  targetValue: z.string().trim().min(1).max(512),
  targetPlatform: z.string().optional(),
});

/** Merge a duplicate into the canonical entry; lookups of the old value follow it. */
export async function mergeInto(input: unknown): Promise<ActionResult<{ targetId: string }>> {
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  if (!(await getAdminUser())) return fail("forbidden");

  const normalized = normalizeReportIdentifier({
    type: parsed.data.targetType,
    value: parsed.data.targetValue,
    platform: parsed.data.targetPlatform,
  });
  if (!normalized) return fail("invalidTarget");
  const target = normalized[0];

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("identifiers")
    .select("id")
    .eq("type", target.type)
    .eq("value_normalized", target.value)
    .maybeSingle();
  if (!row) return fail("targetNotFound");
  if (row.id === parsed.data.sourceId) return fail("sameIdentifier");

  const { error } = await supabase.rpc("admin_merge_identifiers", {
    p_source_id: parsed.data.sourceId,
    p_target_id: row.id,
  });
  if (error) return fail(error.code === "22023" ? "cannotMerge" : "unavailable");
  return ok({ targetId: row.id });
}
