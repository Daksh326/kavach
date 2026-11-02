"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Texts = { en: string; hi: string };

export function ComplaintPanel({
  portal,
  bank,
  defaultLang,
}: {
  portal: Texts;
  bank: Texts | null;
  defaultLang: "en" | "hi";
}) {
  const t = useTranslations("reportPage");
  const [lang, setLang] = useState<"en" | "hi">(defaultLang);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2" role="group" aria-label={t("textLanguage")}>
        <span className="text-sm text-muted-foreground">{t("textLanguage")}:</span>
        {(["en", "hi"] as const).map((l) => (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={lang === l}
            onClick={() => setLang(l)}
            className={cn(
              "h-11 rounded-md border px-4 text-sm font-medium",
              lang === l ? "border-primary bg-accent text-accent-foreground" : "bg-background",
            )}
          >
            {l === "en" ? "English" : "हिन्दी"}
          </button>
        ))}
      </div>

      <TextBlock
        title={t("portalTitle")}
        hint={t("portalHint")}
        text={portal[lang]}
        lang={lang}
        action={
          <a
            href="https://cybercrime.gov.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            {t("openPortal")}
            <ExternalLink className="size-4" aria-hidden />
          </a>
        }
      />
      {bank && (
        <TextBlock title={t("bankTitle")} hint={t("bankHint")} text={bank[lang]} lang={lang} />
      )}
    </div>
  );
}

function TextBlock({
  title,
  hint,
  text,
  lang,
  action,
}: {
  title: string;
  hint: string;
  text: string;
  lang: "en" | "hi";
  action?: React.ReactNode;
}) {
  const t = useTranslations("reportPage");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers / insecure contexts.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <pre
        lang={lang}
        className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-sans text-sm leading-relaxed"
      >
        {text}
      </pre>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="h-11"
          variant={copied ? "secondary" : "default"}
          onClick={copy}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
        </Button>
        {action}
      </div>
    </section>
  );
}
