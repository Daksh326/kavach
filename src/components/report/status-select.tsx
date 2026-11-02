"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";
import { Constants } from "@/lib/supabase/database.types";
import type { Database } from "@/lib/supabase/database.types";
import { updateReportStatus } from "@/app/[locale]/report/actions";
import { selectClass } from "./fields";

type Status = Database["public"]["Enums"]["report_status"];

export function StatusSelect({ reportId, initial }: { reportId: string; initial: Status }) {
  const t = useTranslations();
  const [status, setStatus] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-1">
      <label htmlFor="status" className="text-sm font-medium">
        {t("reportPage.statusLabel")}
      </label>
      <div className="flex items-center gap-3">
        <select
          id="status"
          className={selectClass}
          value={status}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as Status;
            const prev = status;
            setStatus(next);
            setSaved(false);
            start(async () => {
              const res = await updateReportStatus({ reportId, status: next });
              if (res.ok) setSaved(true);
              else setStatus(prev);
            });
          }}
        >
          {Constants.public.Enums.report_status.map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
        </select>
        <span className="w-20 shrink-0 text-sm text-success" aria-live="polite">
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            saved && (
              <span className="inline-flex items-center gap-1">
                <Check className="size-4" aria-hidden />
                {t("reportPage.statusSaved")}
              </span>
            )
          )}
        </span>
      </div>
    </div>
  );
}
