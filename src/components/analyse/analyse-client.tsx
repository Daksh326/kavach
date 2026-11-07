"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { AlertCircle, ImageUp, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/report/fields";
import { cn } from "@/lib/utils";
import { prepareScreenshot, type PreparedImage } from "@/lib/analyse/image";
import { ANALYSE_TEXT_MAX, analyseTextFormSchema } from "@/lib/validation/analyse";
import { analyseMessage, type AnalyseResult } from "@/app/[locale]/analyse/actions";
import { Turnstile, useTurnstile } from "@/components/security/turnstile";
import { AnalyseResultView } from "./analyse-result";
import { track } from "@/lib/analytics/track";

/** Written by the home page's "Is this message a scam?" box. */
const DRAFT_KEY = "kavach:analyse-draft";

function readDraft(): string {
  try {
    return sessionStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function AnalyseClient() {
  const t = useTranslations("analyse");
  const tx = t as unknown as (key: string) => string;
  const [mode, setMode] = useState<"text" | "image">("text");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bot, botRef] = useTurnstile();
  const [result, setResult] = useState<{ data: AnalyseResult; originalText: string | null } | null>(
    null,
  );

  // Client-only component (ssr:false), so reading sessionStorage here is safe.
  const form = useForm<{ text: string }>({
    resolver: zodResolver(analyseTextFormSchema),
    defaultValues: { text: readDraft() },
  });

  // Consume the home-page handoff once (removed in an effect, not during render).
  useEffect(() => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // Free the preview's blob URL when it is replaced or the component unmounts.
    return () => {
      if (image) URL.revokeObjectURL(image.previewUrl);
    };
  }, [image]);

  // Any error key with a message in analyse.errors is shown; unknown keys fall back.
  const errorText = (key: string) =>
    tx(`errors.${t.has(`errors.${key}` as never) ? key : "aiUnavailable"}`);

  async function run(
    payload:
      | { kind: "text"; text: string }
      | { kind: "image"; mimeType: PreparedImage["mimeType"]; dataBase64: string },
    originalText: string | null,
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await analyseMessage(payload, { turnstileToken: bot.token });
      bot.reset(); // single-use token
      if (res.ok) {
        track("analyse_completed", {
          input: payload.kind,
          risk: res.data.analysis.risk,
          cached: res.data.cached,
        });
        setResult({ data: res.data, originalText });
        window.scrollTo({ top: 0 });
      } else setError(res.error);
    } catch {
      setError("aiUnavailable");
    } finally {
      setBusy(false);
    }
  }

  const onText = form.handleSubmit(({ text }) => run({ kind: "text", text }, text));

  async function onPickImage(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPreparing(true);
    try {
      setImage(await prepareScreenshot(file));
    } catch {
      setImage(null);
      setError("invalidImage");
    } finally {
      setPreparing(false);
    }
  }

  function reset() {
    setResult(null);
    setImage(null);
    setError(null);
    form.reset({ text: "" });
  }

  if (result) {
    return (
      <AnalyseResultView result={result.data} originalText={result.originalText} onReset={reset} />
    );
  }

  const fieldError = form.formState.errors.text?.message;

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label={t("title")}
        className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1"
      >
        {(["text", "image"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={cn(
              "h-11 rounded-md text-sm font-semibold",
              mode === m ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {m === "text" ? t("tabText") : t("tabImage")}
          </button>
        ))}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription className="text-base">{errorText(error)}</AlertDescription>
        </Alert>
      )}

      <Turnstile ref={botRef} action="analyse" onToken={bot.onToken} />

      {mode === "text" ? (
        <form onSubmit={onText} className="space-y-3" noValidate>
          <Label htmlFor="analyse-text" className="text-base">
            {t("textLabel")}
          </Label>
          <Textarea
            id="analyse-text"
            rows={8}
            maxLength={ANALYSE_TEXT_MAX}
            placeholder={t("textPlaceholder")}
            aria-invalid={!!fieldError}
            aria-describedby="ai-notice"
            className="min-h-44 text-base"
            {...form.register("text")}
          />
          <FieldError>{fieldError ? errorText(fieldError) : undefined}</FieldError>
          <p id="ai-notice" className="flex gap-2 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("aiNotice")}
          </p>
          <Button
            type="submit"
            size="lg"
            className="h-12 w-full text-base"
            disabled={busy || !bot.ready}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {busy ? t("checking") : t("submit")}
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          <label className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary px-4 text-base font-semibold text-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            {preparing ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <ImageUp className="size-5" aria-hidden />
            )}
            {preparing ? t("imagePreparing") : image ? t("imageChange") : t("imageChoose")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={preparing || busy}
              onChange={(e) => {
                void onPickImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">{t("imageHint")}</p>
          {image && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img
                src={image.previewUrl}
                alt={t("imageAlt")}
                className="max-h-96 w-full rounded-lg border object-contain"
              />
              <p className="flex gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                {t("imageWarning")}
              </p>
              <p className="text-sm text-muted-foreground">{t("imageNotice")}</p>
              <Button
                type="button"
                size="lg"
                className="h-12 w-full text-base"
                disabled={busy || !bot.ready}
                onClick={() =>
                  run(
                    { kind: "image", mimeType: image.mimeType, dataBase64: image.dataBase64 },
                    null,
                  )
                }
              >
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                {busy ? t("checking") : t("imageSubmit")}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
