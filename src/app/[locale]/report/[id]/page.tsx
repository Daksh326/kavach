import type { Metadata } from "next";
import { ClientMessages } from "@/i18n/client-messages";
import { notFound } from "next/navigation";
import { CheckCircle2, Download, FileText, Phone, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AddEvidence } from "@/components/report/add-evidence";
import { ComplaintPanel } from "@/components/report/complaint-panel";
import { DeleteReport } from "@/components/report/delete-report";
import { PdfButtonLoader } from "@/components/report/pdf-button-loader";
import type { PdfData } from "@/components/report/pdf-types";
import { StatusSelect } from "@/components/report/status-select";
import { requireUser } from "@/lib/auth/dal";
import {
  buildBankLetter,
  buildPortalComplaint,
  formatDate,
  formatInr,
  type ComplaintData,
} from "@/lib/complaint/build";
import { getComplaintLabels } from "@/lib/complaint/labels";
import { EVIDENCE_MAX_FILES, formatBytes } from "@/lib/evidence/rules";
import { displayIdentifier } from "@/lib/identifiers/normalize";
import { isStorageConfigured, presignDownload } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const paramsSchema = z.object({ id: z.uuid() });

export default async function ReportDetailPage({
  params,
  searchParams,
}: PageProps<"/[locale]/report/[id]">) {
  const [{ locale, id }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale as "en" | "hi");
  const parsed = paramsSchema.safeParse({ id });
  if (!parsed.success) notFound();
  const user = await requireUser(`/report/${id}`);

  const supabase = await createClient();
  const [{ data: report }, { data: identifiers }, { data: evidence }] = await Promise.all([
    supabase.from("reports").select("*").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.rpc("get_report_identifiers", { p_report_id: id }),
    supabase
      .from("evidence")
      .select("*")
      .eq("report_id", id)
      .eq("user_id", user.id)
      .order("uploaded_at"),
  ]);
  if (!report) notFound();

  const [t, tc, tch, tpm, format, labelsEn, labelsHi] = await Promise.all([
    getTranslations("reportPage"),
    getTranslations("categories"),
    getTranslations("channels"),
    getTranslations("paymentMethods"),
    getFormatter(),
    getComplaintLabels("en"),
    getComplaintLabels("hi"),
  ]);

  const files = evidence ?? [];
  const storage = isStorageConfigured();
  const downloads = await Promise.all(
    files.map((e) =>
      storage
        ? presignDownload({
            key: e.r2_key,
            fileName: e.file_name ?? "evidence",
            contentType: e.mime_type,
          }).catch(() => null)
        : null,
    ),
  );

  const data: ComplaintData = {
    reportId: report.id,
    createdAt: report.created_at,
    category: report.category,
    channel: report.channel,
    description: report.description,
    amountLost: report.amount_lost,
    incidentDate: report.incident_date,
    paymentMethod: report.payment_method,
    bankAccountLast4: report.bank_account_last4,
    transactionRef: report.transaction_ref,
    identifiers: (identifiers ?? []).map((i) => ({ type: i.type, value: i.value_normalized })),
    evidence: files.map((e) => ({ fileName: e.file_name, sha256: e.sha256 })),
  };
  const lostMoney = (report.amount_lost ?? 0) > 0;
  const portal = {
    en: buildPortalComplaint(data, "en", labelsEn),
    hi: buildPortalComplaint(data, "hi", labelsHi),
  };
  const bank = lostMoney
    ? { en: buildBankLetter(data, "en", labelsEn), hi: buildBankLetter(data, "hi", labelsHi) }
    : null;

  const reference = report.id.slice(0, 8).toUpperCase();
  const pdfData: PdfData = {
    reference,
    createdAt: formatDate(report.created_at, "en"),
    generatedAt: formatDate(new Date().toISOString(), "en"),
    rows: [
      ["Type of fraud", labelsEn.category[report.category]],
      ["How the fraudster made contact", labelsEn.channel[report.channel]],
      [
        "Date of incident",
        report.incident_date ? formatDate(report.incident_date, "en") : "Not sure",
      ],
      ["Amount lost", lostMoney ? formatInr(report.amount_lost!, "en") : "No money lost"],
      ...(report.payment_method
        ? [["Payment method", labelsEn.paymentMethod[report.payment_method]] as [string, string]]
        : []),
      ...(report.transaction_ref
        ? [["Transaction ID / UTR", report.transaction_ref] as [string, string]]
        : []),
      ...(report.bank_account_last4
        ? [["Victim's account", `ending in ${report.bank_account_last4}`] as [string, string]]
        : []),
    ],
    identifiers: data.identifiers
      .filter(
        (i) =>
          i.type !== "domain" ||
          !data.identifiers.some((u) => u.type === "url" && u.value.includes(i.value)),
      )
      .map((i) => `${labelsEn.identifierType[i.type]}: ${displayIdentifier(i.type, i.value)}`),
    description: report.description,
    evidence: files.map((e) => ({
      name: e.file_name ?? "file",
      size: formatBytes(e.size_bytes),
      sha256: e.sha256,
    })),
    portalText: portal.en,
  };

  const created = format.dateTime(new Date(report.created_at), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <ClientMessages
      namespaces={["reportPage", "statuses", "report.steps.evidence", "report.errors"]}
    >
      <article className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("created", { date: created })} · #{reference}
          </p>
        </header>

        {sp.new === "1" && (
          <Alert className="border-success/50 bg-success/10">
            <CheckCircle2 className="text-success" aria-hidden />
            <AlertDescription className="text-base text-foreground">
              {t("newBanner")}
            </AlertDescription>
          </Alert>
        )}
        {sp.upload === "failed" && (
          <Alert variant="destructive">
            <AlertDescription className="text-base">{t("uploadIssue")}</AlertDescription>
          </Alert>
        )}

        <StatusSelect reportId={report.id} initial={report.status} />

        <section className="space-y-4">
          <h2 className="text-xl font-bold">{t("fileTitle")}</h2>
          <p className="flex gap-2 rounded-lg bg-muted p-3 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("notFiling")}
          </p>
          <a
            href="tel:1930"
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-destructive px-4 font-semibold text-destructive-foreground"
          >
            <Phone className="size-5" aria-hidden />
            {t("call1930")}
          </a>
          <ComplaintPanel portal={portal} bank={bank} defaultLang={locale === "hi" ? "hi" : "en"} />
          <PdfButtonLoader data={pdfData} />
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">{t("evidenceTitle")}</h2>
          {files.length === 0 ? (
            <p className="text-muted-foreground">{t("evidenceEmpty")}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("hashHint")}</p>
              <ul className="space-y-2">
                {files.map((e, i) => (
                  <li key={e.id} className="space-y-2 rounded-lg border bg-card p-3">
                    <div className="flex items-center gap-3">
                      <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{e.file_name ?? "file"}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatBytes(e.size_bytes)}
                        </span>
                      </span>
                      {downloads[i] && (
                        <a
                          href={downloads[i]!}
                          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-md px-3 text-sm font-medium text-primary hover:bg-accent"
                        >
                          <Download className="size-4" aria-hidden />
                          {t("download")}
                        </a>
                      )}
                    </div>
                    <p className="text-xs">
                      <span className="text-muted-foreground">{t("hash")}: </span>
                      <span className="break-all font-mono">{e.sha256}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
          {files.length < EVIDENCE_MAX_FILES && (
            <AddEvidence reportId={report.id} existingCount={files.length} />
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-bold">{t("detailsTitle")}</h2>
          <dl className="divide-y rounded-xl border bg-card text-sm">
            {[
              [tc(report.category), tch(report.channel)],
              [
                report.incident_date
                  ? format.dateTime(new Date(report.incident_date), { dateStyle: "long" })
                  : "–",
                lostMoney
                  ? `${formatInr(report.amount_lost!, locale === "hi" ? "hi" : "en")}${report.payment_method ? ` · ${tpm(report.payment_method)}` : ""}`
                  : "–",
              ],
            ].map(([a, b], i) => (
              <div key={i} className="flex justify-between gap-3 p-3">
                <span>{a}</span>
                <span className="text-right text-muted-foreground">{b}</span>
              </div>
            ))}
            {data.identifiers.length > 0 && (
              <div className="space-y-1 p-3">
                {data.identifiers.map((i) => (
                  <p key={`${i.type}:${i.value}`} className="break-all font-mono">
                    {displayIdentifier(i.type, i.value)}
                  </p>
                ))}
              </div>
            )}
          </dl>
        </section>

        <DeleteReport reportId={report.id} />
      </article>
    </ClientMessages>
  );
}
