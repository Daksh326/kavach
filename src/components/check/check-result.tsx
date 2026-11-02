import { AlertTriangle, Info, ShieldAlert, ShieldQuestion } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import type { DetectResult } from "@/lib/identifiers/normalize";
import type { LookupHit, SimilarHit } from "@/lib/identifiers/lookup";

type Detected = Extract<DetectResult, { ok: true }>;

export async function CheckResult({
  detected,
  hits,
  similar,
}: {
  detected: Detected;
  hits: LookupHit[];
  similar: SimilarHit[];
}) {
  const [t, tc, tch, format] = await Promise.all([
    getTranslations("check"),
    getTranslations("categories"),
    getTranslations("channels"),
    getFormatter(),
  ]);

  const reported = hits.filter((h) => h.isReported);
  const maxCount = Math.max(0, ...reported.map((h) => h.reporterCount));
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric" });

  function rowLabel(hit: LookupHit): string {
    if (detected.kind === "url") {
      return hit.type === "domain" ? t("rows.website", { domain: hit.value }) : t("rows.exactLink");
    }
    if (detected.kind === "telegram" && hit.type === "url") return t("rows.telegramLink");
    return t(`kinds.${detected.kind}`);
  }

  return (
    <section aria-live="polite" className="space-y-4">
      {/* Summary */}
      {reported.length > 0 ? (
        <div className="space-y-3 rounded-xl border-2 border-destructive bg-destructive/5 p-4">
          <h2 className="flex items-start gap-2 text-xl font-bold text-destructive">
            <ShieldAlert className="mt-0.5 size-6 shrink-0" aria-hidden />
            {t("reportedTitle", { count: maxCount })}
          </h2>
          <p className="text-sm font-medium">{t("notVerified")}</p>
          <p>{t("reportedAdvice")}</p>
          <Link
            href="/emergency"
            className="flex h-12 items-center justify-center rounded-lg bg-destructive px-4 font-semibold text-destructive-foreground"
          >
            {t("emergencyCta")}
          </Link>
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <ShieldQuestion className="size-6 shrink-0 text-muted-foreground" aria-hidden />
            {t("notReportedTitle")}
          </h2>
          <p>{t("notReportedBody")}</p>
          <p className="font-medium">{t("notReportedAdvice")}</p>
        </div>
      )}

      {/* What we understood the input to be */}
      {detected.url?.hasLookalikeChars && (
        <Note tone="warning">{t("lookalike", { host: detected.url.host })}</Note>
      )}
      {detected.kind === "whatsapp" && (
        <Note>{t("whatsappFound", { phone: detected.display })}</Note>
      )}
      {detected.kind === "telegram" && (
        <Note>{t("telegramFound", { handle: detected.display })}</Note>
      )}
      {detected.kind === "url" && detected.url && !detected.url.domain && (
        <Note>{t("sharedPlatform", { host: detected.url.host })}</Note>
      )}

      {/* Per-identifier details */}
      <ul className="space-y-3">
        {hits.map((hit) => (
          <li key={`${hit.type}:${hit.value}`} className="space-y-2 rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{rowLabel(hit)}</p>
            <p className="break-all font-mono text-base font-semibold">
              {hit.type === "phone" || detected.kind === "telegram" ? detected.display : hit.value}
            </p>
            {hit.isReported ? (
              <div className="space-y-3">
                {hits.length > 1 && (
                  <p className="font-semibold text-destructive">
                    {t("reportedTitle", { count: hit.reporterCount })}
                  </p>
                )}
                {hit.categories.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t("categories")}</p>
                    <div className="flex flex-wrap gap-2">
                      {hit.categories.map((c) => (
                        <Badge key={c} variant="secondary" className="text-sm">
                          {tc(c)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {hit.channels.length > 0 && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t("channels")}: </span>
                    {hit.channels.map((c) => tch(c)).join(", ")}
                  </p>
                )}
                {hit.firstSeen && hit.lastSeen && (
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">{t("firstReported")}</dt>
                      <dd>{date(hit.firstSeen)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("lastReported")}</dt>
                      <dd>{date(hit.lastSeen)}</dd>
                    </div>
                  </dl>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("notReportedTitle")}</p>
            )}
          </li>
        ))}
      </ul>

      {similar.length > 0 && (
        <div className="space-y-2 rounded-xl border border-warning/50 bg-warning/5 p-4">
          <h3 className="flex items-center gap-2 font-bold">
            <AlertTriangle className="size-5 text-warning" aria-hidden />
            {t("similarTitle")}
          </h3>
          <p className="text-sm">{t("similarHint")}</p>
          <ul className="space-y-1">
            {similar.map((s) => (
              <li key={s.value} className="flex justify-between gap-3 text-sm">
                <span className="break-all font-mono">{s.value}</span>
                <span className="shrink-0 text-muted-foreground">
                  {t("similarCount", { count: s.reporterCount })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Note({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warning";
}) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <p
      className={
        tone === "warning"
          ? "flex gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm"
          : "flex gap-2 rounded-lg bg-muted p-3 text-sm"
      }
    >
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${tone === "warning" ? "text-warning" : ""}`}
        aria-hidden
      />
      <span>{children}</span>
    </p>
  );
}
