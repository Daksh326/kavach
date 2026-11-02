"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteReport } from "@/app/[locale]/report/actions";
import { FieldError } from "./fields";

export function DeleteReport({ reportId }: { reportId: string }) {
  const t = useTranslations("reportPage");
  const te = useTranslations("report.errors");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  return (
    <section className="space-y-3 rounded-xl border border-destructive/40 p-4">
      <h2 className="font-bold">{t("deleteTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("deleteBody")}</p>
      {!confirming ? (
        <Button
          type="button"
          variant="outline"
          className="h-11 border-destructive text-destructive"
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden />
          {t("deleteButton")}
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="destructive"
            className="h-11"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteReport({ reportId });
                if (res && !res.ok) setError(true);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? t("deleting") : t("deleteConfirm")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            {t("cancel")}
          </Button>
        </div>
      )}
      {error && <FieldError>{te("serviceUnavailable")}</FieldError>}
    </section>
  );
}
