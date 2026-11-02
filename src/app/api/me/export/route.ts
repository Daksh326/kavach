import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { isStorageConfigured, presignDownload } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";

const LINK_TTL_SECONDS = 15 * 60;

/** DPDP right of access: everything we hold about the signed-in user, as JSON. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const [profile, reports, evidence, analyses] = await Promise.all([
    supabase.from("profiles").select("name, language, created_at").eq("id", user.id).single(),
    supabase.from("reports").select("*").eq("user_id", user.id).order("created_at"),
    supabase.from("evidence").select("*").eq("user_id", user.id).order("uploaded_at"),
    supabase
      .from("ai_analyses")
      .select("id, input_kind, model, result_json, created_at")
      .eq("user_id", user.id),
  ]);
  if (profile.error || reports.error || evidence.error || analyses.error) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const identifiersByReport = await Promise.all(
    (reports.data ?? []).map(async (r) => {
      const { data } = await supabase.rpc("get_report_identifiers", { p_report_id: r.id });
      return [r.id, data ?? []] as const;
    }),
  );
  const ids = new Map(identifiersByReport);

  const storage = isStorageConfigured();
  const evidenceOut = await Promise.all(
    (evidence.data ?? []).map(async (e) => ({
      id: e.id,
      report_id: e.report_id,
      file_name: e.file_name,
      mime_type: e.mime_type,
      size_bytes: e.size_bytes,
      sha256: e.sha256,
      uploaded_at: e.uploaded_at,
      download_url: storage
        ? await presignDownload({
            key: e.r2_key,
            fileName: e.file_name ?? "evidence",
            contentType: e.mime_type,
            ttlSeconds: LINK_TTL_SECONDS,
          }).catch(() => null)
        : null,
    })),
  );

  const body = {
    exported_at: new Date().toISOString(),
    note: `Evidence download links expire ${LINK_TTL_SECONDS / 60} minutes after export.`,
    account: { id: user.id, email: user.email, ...profile.data },
    reports: (reports.data ?? []).map((r) => ({
      ...r,
      scammer_identifiers: ids.get(r.id) ?? [],
    })),
    evidence: evidenceOut,
    ai_analyses: analyses.data ?? [],
  };

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="kavach-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
