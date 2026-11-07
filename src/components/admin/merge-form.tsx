"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/report/fields";
import { useRouter } from "@/i18n/navigation";
import { REPORT_IDENTIFIER_TYPES, SOCIAL_PLATFORMS } from "@/lib/identifiers/basic";
import { mergeInto } from "@/app/[locale]/admin/actions";

export function MergeForm({ sourceId, sourceType }: { sourceId: string; sourceType: string }) {
  const t = useTranslations("admin");
  const tx = t as unknown as (key: string) => string;
  const router = useRouter();
  const [type, setType] = useState<string>(
    (REPORT_IDENTIFIER_TYPES as readonly string[]).includes(sourceType) ? sourceType : "phone",
  );
  const [platform, setPlatform] = useState<string>("instagram");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await mergeInto({
            sourceId,
            targetType: type,
            targetValue: value,
            targetPlatform: platform,
          });
          if (res.ok) router.push(`/admin/identifier/${res.data.targetId}`);
          else setError(res.error);
        });
      }}
    >
      <p className="text-sm text-muted-foreground">{t("mergeHint")}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <select
          aria-label={t("mergeType")}
          className={selectClass}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {REPORT_IDENTIFIER_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {ty}
            </option>
          ))}
        </select>
        {type === "social" && (
          <select
            aria-label={t("mergePlatform")}
            className={selectClass}
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            {SOCIAL_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
        <Input
          aria-label={t("mergeTarget")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("mergeTarget")}
          className="h-12 text-base sm:col-span-2"
          autoCapitalize="none"
        />
      </div>
      <Button type="submit" className="h-11" disabled={pending || !value.trim()}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {t("mergeButton")}
      </Button>
      {error && <p className="text-sm text-destructive">{tx(`errors.${error}`)}</p>}
    </form>
  );
}
