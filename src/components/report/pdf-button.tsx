"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PdfData } from "./pdf-types";
import { FieldError } from "./fields";

export function PdfButton({ data }: { data: PdfData }) {
  const t = useTranslations("reportPage");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      const { renderReportPdf } = await import("./report-pdf");
      const blob = await renderReportPdf(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kavach-report-${data.reference}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      console.error("pdf failed", e instanceof Error ? e.message : e);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-12 w-full text-base"
        onClick={download}
        disabled={busy}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}
        {busy ? t("pdfPreparing") : t("pdf")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("pdfNote")}</p>
      {failed && <FieldError>{t("pdfFailed")}</FieldError>}
    </div>
  );
}
