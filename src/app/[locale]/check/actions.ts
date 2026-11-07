"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth/dal";
import { lookupIdentifiers } from "@/lib/identifiers/lookup";
import { stripSensitive } from "@/lib/redact/sensitive";
import { clientIpHash } from "@/lib/security/client-ip";
import { withinLimits } from "@/lib/security/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { createAdminClient } from "@/lib/supabase/admin";
import { Constants } from "@/lib/supabase/database.types";
import { actionMetaSchema } from "@/lib/validation/meta";

const E = Constants.public.Enums;

const flagSchema = z.object({
  type: z.enum(E.identifier_type),
  value: z.string().min(3).max(512),
  reason: z.enum(E.flag_reason),
  details: z.string().trim().max(1000),
});

/**
 * Anyone (signed in or not) can flag a PUBLIC identifier for moderator
 * review. Entries below the public threshold are refused exactly like
 * missing ones, so flagging can't be used to probe hidden data.
 */
export async function flagIdentifier(input: unknown, meta?: unknown): Promise<ActionResult> {
  const parsed = flagSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const v = parsed.data;

  if (!(await withinLimits(["flagIp", await clientIpHash()]))) return fail("rateLimited");
  if (!(await verifyTurnstile(actionMetaSchema.parse(meta)?.turnstileToken, "flag")))
    return fail("botCheckFailed");

  const lookup = await lookupIdentifiers([{ type: v.type, value: v.value }]);
  if (!lookup.ok) return fail("unavailable");
  if (!lookup.hits[0]?.isReported) return fail("notFlaggable");

  const user = await getCurrentUser();
  try {
    const { error } = await createAdminClient().rpc("flag_identifier", {
      p_type: v.type,
      p_value: v.value,
      p_reason: v.reason,
      p_details: stripSensitive(v.details).text,
      // Signed-out flaggers are allowed: the column is nullable, the generated type isn't.
      p_flagged_by: (user?.id ?? null) as string,
    });
    if (error) {
      console.error("flag_identifier failed", error.code);
      return fail(error.code === "P0002" ? "notFlaggable" : "unavailable");
    }
  } catch {
    return fail("unavailable");
  }
  return ok(undefined);
}
