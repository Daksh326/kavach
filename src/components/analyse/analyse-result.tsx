"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, ChevronRight, Info, ShieldAlert, ShieldQuestion } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { writeReportPrefill } from "@/lib/report/prefill";
import type { AnalyseResult } from "@/app/[locale]/analyse/actions";

const REPORTABLE = new Set(["phone", "upi", "url", "email", "bank_ifsc"]);

export function AnalyseResultView({
  result,
  originalText,
  onReset,
}: {
  result: AnalyseResult;
  /** The text the user pasted (stays in the browser), for the report description. */
  originalText: string | null;
  onReset: () => void;
}) {
  const t = useTranslations("analyse");
  const tc = useTranslations("categories");
  const tx = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const router = useRouter();
  const { analysis } = result;

  const tone = {
    high: {
      icon: ShieldAlert,
      box: "border-destructive bg-destructive/5",
      text: "text-destructive",
      label: t("result.riskHigh"),
    },
    medium: {
      icon: AlertTriangle,
      box: "border-warning bg-warning/10",
      text: "text-warning",
      label: t("result.riskMedium"),
    },
    low: {
      icon: ShieldQuestion,
      box: "border-border bg-card",
      text: "text-foreground",
      label: t("result.riskLow"),
    },
  }[analysis.risk];
  const Icon = tone.icon;

  function reportThis() {
    writeReportPrefill({
      category: analysis.scam_type === "not_scam" ? undefined : analysis.scam_type,
      identifiers: result.identifiers
        .filter((i) => REPORTABLE.has(i.type))
        .map((i) => ({
          type: i.type as "phone" | "upi" | "url" | "email" | "bank_ifsc",
          value: i.value,
        })),
      description: originalText ? originalText.slice(0, 4500) : "",
    });
    router.push("/report");
  }

  return (
    <section aria-live="polite" className="space-y-4">
      <div className={cn("space-y-3 rounded-xl border-2 p-4", tone.box)}>
        <h2 className={cn("flex items-center gap-2 text-xl font-bold", tone.text)}>
          <Icon className="size-6 shrink-0" aria-hidden />
          {tone.label}
        </h2>
        {analysis.scam_type !== "not_scam" && (
          <p>
            <span className="text-muted-foreground">{t("result.scamType")}: </span>
            <span className="font-semibold">{tc(analysis.scam_type)}</span>
          </p>
        )}
        {result.riskRaised && <p className="text-sm font-medium">{t("result.riskRaised")}</p>}
        {analysis.risk === "low" && <p className="text-sm">{t("result.lowNote")}</p>}
      </div>

      {analysis.red_flags.length > 0 && (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <h3 className="font-bold">{t("result.redFlags")}</h3>
          <ul className="list-disc space-y-1 pl-5">
            {analysis.red_flags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2 rounded-xl border bg-card p-4">
        <h3 className="font-bold">{t("result.advice")}</h3>
        <p className="whitespace-pre-line">{analysis.advice}</p>
      </div>

      {result.identifiers.length > 0 && (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <h3 className="font-bold">{t("result.identifiersTitle")}</h3>
          <ul className="divide-y">
            {result.identifiers.map((i) => (
              <li key={`${i.type}:${i.value}`} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block break-all font-mono text-sm">{i.display}</span>
                  {i.isReported ? (
                    <Badge variant="destructive">
                      {t("result.reportedBy", { count: i.reporterCount })}
                    </Badge>
                  ) : (
                    <span className="block text-xs text-muted-foreground">
                      {t("result.notReported")}
                    </span>
                  )}
                </span>
                <Link
                  href={{ pathname: "/check", query: { q: i.value } }}
                  className="inline-flex h-11 shrink-0 items-center gap-1 rounded-md px-3 text-sm font-medium text-primary hover:bg-accent"
                >
                  {t("result.details")}
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2 rounded-xl border bg-card p-4">
        <p className="text-sm">{t("result.reportHint")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" size="lg" className="h-12 text-base" onClick={reportThis}>
            {t("result.reportThis")}
          </Button>
          <Link
            href="/emergency"
            className="flex h-12 items-center justify-center rounded-lg border-2 border-destructive font-semibold text-destructive"
          >
            {t("result.lostMoney")}
          </Link>
        </div>
      </div>

      {result.sentText !== null && (
        <details className="rounded-xl border bg-card p-4">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
            <Info className="size-4" aria-hidden />
            {t("result.sentTitle")}
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">
            {result.removed.length
              ? t("result.removedNote", {
                  items: result.removed.map((k) => tx(`removed.${k}`)).join(", "),
                })
              : t("result.nothingRemoved")}
          </p>
          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-sans text-sm">
            {result.sentText}
          </pre>
        </details>
      )}

      <p className="text-xs text-muted-foreground">{t("result.aiDisclaimer")}</p>
      <Button type="button" variant="outline" className="h-12 w-full text-base" onClick={onReset}>
        {t("result.checkAnother")}
      </Button>
    </section>
  );
}
