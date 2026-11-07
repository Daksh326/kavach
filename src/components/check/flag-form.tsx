"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, RadioCard } from "@/components/report/fields";
import { Turnstile, useTurnstile } from "@/components/security/turnstile";
import { Constants, type Database } from "@/lib/supabase/database.types";
import { flagIdentifier } from "@/app/[locale]/check/actions";
import { track } from "@/lib/analytics/track";

type IdType = Database["public"]["Enums"]["identifier_type"];
type Reason = Database["public"]["Enums"]["flag_reason"];

export function FlagForm({ type, value }: { type: IdType; value: string }) {
  const t = useTranslations("flag");
  const tx = t as unknown as (key: string) => string;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const [bot, botRef] = useTurnstile();

  if (done) {
    return (
      <p className="flex items-center gap-2 text-sm text-success" aria-live="polite">
        <CheckCircle2 className="size-4" aria-hidden />
        {t("thanks")}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
      >
        <Flag className="size-4" aria-hidden />
        {t("open")}
      </button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!reason) return setError("chooseReason");
        setError(null);
        start(async () => {
          const res = await flagIdentifier(
            { type, value, reason, details },
            { turnstileToken: bot.token },
          );
          bot.reset();
          if (res.ok) {
            track("flag_submitted", { reason });
            setDone(true);
          } else setError(res.error);
        });
      }}
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">{t("title")}</legend>
        {Constants.public.Enums.flag_reason.map((r) => (
          <RadioCard
            key={r}
            name={`flag-${type}-${value}`}
            value={r}
            checked={reason === r}
            onChange={() => setReason(r)}
            label={tx(`reasons.${r}`)}
          />
        ))}
      </fieldset>
      <label className="block space-y-1">
        <span className="text-sm">{t("detailsLabel")}</span>
        <Textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={1000}
          rows={3}
          className="text-base"
        />
      </label>
      <Turnstile ref={botRef} action="flag" onToken={bot.onToken} />
      {error && <FieldError>{tx(`errors.${error}`)}</FieldError>}
      <div className="flex gap-2">
        <Button type="submit" className="h-11" disabled={pending || !bot.ready}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {t("submit")}
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
