"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth/dal";
import {
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_FILES,
  cleanFileName,
  hexToBase64,
  isAllowedMime,
} from "@/lib/evidence/rules";
import { normalizeReportIdentifier, type NormalizedIdentifier } from "@/lib/identifiers/normalize";
import { stripSensitive } from "@/lib/redact/sensitive";
import { deleteObject, headObject, isStorageConfigured, presignUpload } from "@/lib/storage/r2";
import { purgeR2Keys } from "@/lib/storage/purge";
import { signTicket, verifyTicket } from "@/lib/storage/upload-ticket";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { clientIpHash } from "@/lib/security/client-ip";
import { withinLimits } from "@/lib/security/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { actionMetaSchema } from "@/lib/validation/meta";
import {
  CONSENT_VERSION,
  evidenceConfirmSchema,
  evidenceUploadRequestSchema,
  reportIdSchema,
  reportStatusSchema,
  reportSubmitSchema,
} from "@/lib/validation/report";

/** Owner check that also excludes admins (who can read reports via RLS). */
async function ownsReport(userId: string, reportId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("id")
    .eq("id", reportId)
    .eq("user_id", userId)
    .maybeSingle();
  return data !== null;
}

export async function submitReport(
  input: unknown,
  meta?: unknown,
): Promise<ActionResult<{ reportId: string }>> {
  const parsed = reportSubmitSchema.safeParse(input);
  if (!parsed.success) {
    const consentIssue = parsed.error.issues.some((i) => i.path[0] === "consent");
    return fail(consentIssue ? "consentRequired" : "invalidIdentifier");
  }
  const v = parsed.data;

  const user = await getCurrentUser();
  if (!user) return fail("signInRequired");

  if (!(await withinLimits(["reportUser", user.id], ["reportIp", await clientIpHash()]))) {
    return fail("rateLimited");
  }
  if (!(await verifyTurnstile(actionMetaSchema.parse(meta)?.turnstileToken, "report"))) {
    return fail("botCheckFailed");
  }

  // Normalise server-side (never trust the client) and de-duplicate.
  const identifiers = new Map<string, NormalizedIdentifier>();
  for (const entry of v.identifiers) {
    const normalized = normalizeReportIdentifier(entry);
    if (!normalized) return fail("invalidIdentifier");
    for (const n of normalized) identifiers.set(`${n.type}:${n.value}`, n);
  }

  const lostMoney = v.lostMoney === "yes";
  const report = {
    category: v.category,
    channel: v.channel,
    description: stripSensitive(v.description).text,
    amount_lost: lostMoney ? v.amountLost.replace(/,/g, "") : "",
    incident_date: v.incidentDate,
    payment_method: lostMoney ? v.paymentMethod : "",
    bank_account_last4: v.bankAccountLast4,
    transaction_ref: lostMoney ? v.transactionRef : "",
    consent_at: new Date().toISOString(),
    consent_version: CONSENT_VERSION,
  };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("submit_report", {
      p_user_id: user.id,
      p_report: report,
      p_identifiers: [...identifiers.values()],
    });
    if (error) {
      console.error("submit_report failed", error.code);
      return fail(error.code === "P0429" ? "rateLimited" : "serviceUnavailable");
    }
    return ok({ reportId: data });
  } catch {
    return fail("serviceUnavailable");
  }
}

export async function createEvidenceUpload(
  input: unknown,
): Promise<ActionResult<{ url: string; headers: Record<string, string>; ticket: string }>> {
  const parsed = evidenceUploadRequestSchema.safeParse(input);
  if (!parsed.success) return fail("uploadFailed");
  const v = parsed.data;
  if (!isAllowedMime(v.mimeType) || v.sizeBytes > EVIDENCE_MAX_BYTES) return fail("uploadFailed");

  const user = await getCurrentUser();
  if (!user) return fail("signInRequired");
  if (!isStorageConfigured()) return fail("storageUnavailable");
  if (!(await withinLimits(["uploadUser", user.id]))) return fail("rateLimited");
  if (!(await ownsReport(user.id, v.reportId))) return fail("notFound");

  const supabase = await createClient();
  const { count } = await supabase
    .from("evidence")
    .select("id", { count: "exact", head: true })
    .eq("report_id", v.reportId);
  if ((count ?? 0) >= EVIDENCE_MAX_FILES) return fail("evidenceLimit");

  // Opaque key: no file name or other personal data in object keys.
  const key = `evidence/${user.id}/${v.reportId}/${crypto.randomUUID()}`;
  try {
    const { url, headers } = await presignUpload({
      key,
      contentType: v.mimeType,
      md5Base64: hexToBase64(v.md5),
    });
    const ticket = await signTicket({
      key,
      reportId: v.reportId,
      sha256: v.sha256,
      md5: v.md5,
      size: v.sizeBytes,
      mime: v.mimeType,
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    return ok({ url, headers, ticket });
  } catch {
    return fail("storageUnavailable");
  }
}

export async function confirmEvidenceUpload(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = evidenceConfirmSchema.safeParse(input);
  if (!parsed.success) return fail("uploadFailed");

  const user = await getCurrentUser();
  if (!user) return fail("signInRequired");

  const t = await verifyTicket(parsed.data.ticket);
  if (!t || !t.key.startsWith(`evidence/${user.id}/${t.reportId}/`)) return fail("uploadFailed");

  try {
    const head = await headObject(t.key);
    if (!head) return fail("uploadFailed");
    if (head.size !== t.size || head.size > EVIDENCE_MAX_BYTES) {
      await deleteObject(t.key);
      return fail("uploadFailed");
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("evidence")
      .insert({
        report_id: t.reportId,
        user_id: user.id,
        r2_key: t.key,
        file_name: cleanFileName(parsed.data.fileName),
        mime_type: t.mime,
        size_bytes: t.size,
        sha256: t.sha256,
      })
      .select("id")
      .single();
    if (error) {
      await deleteObject(t.key);
      return fail(error.code === "P0413" ? "evidenceLimit" : "uploadFailed");
    }
    return ok({ id: data.id });
  } catch {
    return fail("storageUnavailable");
  }
}

export async function updateReportStatus(input: unknown): Promise<ActionResult> {
  const parsed = reportStatusSchema.safeParse(input);
  if (!parsed.success) return fail("serviceUnavailable");
  const user = await getCurrentUser();
  if (!user) return fail("signInRequired");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.reportId)
    .eq("user_id", user.id)
    .select("id");
  if (error || !data?.length) return fail(error ? "serviceUnavailable" : "notFound");
  return ok(undefined);
}

export async function deleteReport(input: unknown): Promise<ActionResult> {
  const parsed = reportIdSchema.safeParse(input);
  if (!parsed.success) return fail("notFound");
  const user = await getCurrentUser();
  if (!user) return fail("signInRequired");

  const supabase = await createClient();
  const { data: files } = await supabase
    .from("evidence")
    .select("r2_key")
    .eq("report_id", parsed.data.reportId)
    .eq("user_id", user.id);

  // Cascade deletes evidence rows; a trigger queues their R2 keys.
  const { data, error } = await supabase
    .from("reports")
    .delete()
    .eq("id", parsed.data.reportId)
    .eq("user_id", user.id)
    .select("id");
  if (error || !data?.length) return fail(error ? "serviceUnavailable" : "notFound");

  await purgeR2Keys((files ?? []).map((f) => f.r2_key));

  const locale = await getLocale();
  redirect({ href: "/dashboard", locale });
  return ok(undefined);
}

/** Lets the (static, client-rendered) wizard know whether to offer "Sign in to submit". Takes no input. */
export async function getSessionStatus(): Promise<{ signedIn: boolean }> {
  return { signedIn: (await getCurrentUser()) !== null };
}
