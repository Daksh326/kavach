"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Handoff key read by /analyse. Kept out of the URL so message text never lands in logs/history. */
export const ANALYSE_DRAFT_KEY = "kavach:analyse-draft";

export function AnalyseBox() {
  const t = useTranslations("home");
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const value = text.trim();
        if (!value) return setError(true);
        try {
          sessionStorage.setItem(ANALYSE_DRAFT_KEY, value.slice(0, 5000));
        } catch {
          // Storage unavailable: the analyse page will just start empty.
        }
        router.push("/analyse");
      }}
    >
      <label htmlFor="analyse-text" className="sr-only">
        {t("analysePlaceholder")}
      </label>
      <Textarea
        id="analyse-text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(false);
        }}
        placeholder={t("analysePlaceholder")}
        rows={4}
        maxLength={5000}
        aria-invalid={error}
        aria-describedby="analyse-notice"
        className="min-h-28 text-base"
      />
      {error && <p className="text-sm text-destructive">{t("analyseEmpty")}</p>}
      <p id="analyse-notice" className="text-xs text-muted-foreground">
        {t("analyseNotice")}
      </p>
      <Button type="submit" size="lg" variant="secondary" className="h-12 w-full text-base">
        <Sparkles aria-hidden />
        {t("analyseButton")}
      </Button>
    </form>
  );
}
