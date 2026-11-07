"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { captureClientError } from "@/lib/monitoring/client";

/** Friendly fallback for errors while rendering a page; always points to 1930. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorPage");
  useEffect(() => {
    captureClientError(error, {
      source: "error-boundary",
      ...(error.digest ? { digest: error.digest } : {}),
    });
  }, [error]);

  return (
    <section className="space-y-4 text-center">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p>{t("body")}</p>
      <a
        href="tel:1930"
        className="mx-auto flex h-12 max-w-xs items-center justify-center gap-2 rounded-lg bg-destructive font-semibold text-destructive-foreground"
      >
        <Phone className="size-5" aria-hidden />
        1930
      </a>
      <div className="flex justify-center gap-2">
        <Button type="button" variant="outline" className="h-11" onClick={reset}>
          {t("retry")}
        </Button>
        <Link
          href="/"
          className="inline-flex h-11 items-center px-3 text-primary underline-offset-4 hover:underline"
        >
          {t("home")}
        </Link>
      </div>
    </section>
  );
}
