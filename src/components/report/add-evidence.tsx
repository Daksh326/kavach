"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { EVIDENCE_ACCEPT } from "@/lib/evidence/rules";
import { prepareFiles, uploadEvidence, type PrepareIssue } from "@/lib/report/evidence-client";
import { FieldError } from "./fields";

const KNOWN = new Set(["uploadFailed", "storageUnavailable", "evidenceLimit", "notFound"]);

/** On the report page: hash -> presigned upload -> confirm, then refresh the list. */
export function AddEvidence({
  reportId,
  existingCount,
}: {
  reportId: string;
  existingCount: number;
}) {
  const t = useTranslations("report");
  const tp = useTranslations("reportPage");
  const tx = t as unknown as (key: string, values?: Record<string, string>) => string;
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [issues, setIssues] = useState<PrepareIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  async function onPick(list: FileList | null) {
    if (!list?.length) return;
    setIssues([]);
    setError(null);
    setDone(null);
    const { ready, issues: found } = await prepareFiles([...list], existingCount, setBusy);
    setIssues(found);
    let uploaded = 0;
    for (const f of ready) {
      setBusy(f.name);
      const r = await uploadEvidence(reportId, f);
      if (r === "ok") uploaded++;
      else setError(KNOWN.has(r) ? r : "uploadFailed");
    }
    setBusy(null);
    if (uploaded) {
      setDone(uploaded);
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary text-base font-semibold text-primary has-[:disabled]:opacity-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
        {busy ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : (
          <Upload className="size-5" aria-hidden />
        )}
        {busy ? tx("steps.evidence.processing", { name: busy }) : tp("addEvidence")}
        <input
          type="file"
          multiple
          accept={EVIDENCE_ACCEPT}
          className="sr-only"
          disabled={!!busy}
          onChange={(e) => {
            void onPick(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {done !== null && (
        <p className="text-sm text-success" aria-live="polite">
          {tp("uploadDone", { count: done })}
        </p>
      )}
      {issues.map((iss, i) => (
        <FieldError key={i}>{tx(`steps.evidence.${iss.kind}`, { name: iss.name })}</FieldError>
      ))}
      {error && <FieldError>{tx(`errors.${error}`)}</FieldError>}
    </div>
  );
}
