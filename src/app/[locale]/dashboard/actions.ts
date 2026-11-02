"use server";

import { z } from "zod";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { fail, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth/dal";
import { purgeR2Keys } from "@/lib/storage/purge";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ confirm: z.literal("DELETE") });

/**
 * DPDP right to erasure: deletes the auth user, which cascades to the
 * profile, reports, identifier links (aggregates recomputed), evidence rows
 * (R2 keys queued), AI analyses; flags keep no link to the user.
 */
export async function deleteMyAccount(input: unknown): Promise<ActionResult> {
  if (!schema.safeParse(input).success) return fail("deleteFailed");
  const user = await getCurrentUser();
  if (!user) return fail("deleteFailed");

  try {
    const admin = createAdminClient();
    const { data: files } = await admin.from("evidence").select("r2_key").eq("user_id", user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      console.error("deleteUser failed", error.status);
      return fail("deleteFailed");
    }
    await purgeR2Keys((files ?? []).map((f) => f.r2_key));
  } catch {
    return fail("deleteFailed");
  }

  // Clear the session cookies (the user no longer exists).
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);

  const locale = await getLocale();
  redirect({ href: "/", locale });
  return fail("deleteFailed"); // unreachable: redirect throws
}
