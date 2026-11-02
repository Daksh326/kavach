import type { Metadata } from "next";
import { AlertCircle } from "lucide-react";
import { z } from "zod";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckForm } from "@/components/check/check-form";
import { CheckResult } from "@/components/check/check-result";
import { detectIdentifier } from "@/lib/identifiers/normalize";
import { lookupIdentifiers } from "@/lib/identifiers/lookup";

const searchSchema = z.object({
  q: z.string().max(2000).optional().catch(undefined),
});

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/[locale]/check">): Promise<Metadata> {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const t = await getTranslations({ locale: locale as "en" | "hi", namespace: "check" });
  const { q } = searchSchema.parse(sp);
  return {
    title: t("metaTitle"),
    description: t("intro"),
    // Never let search engines index lookups of specific numbers/IDs.
    ...(q ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function CheckPage({ params, searchParams }: PageProps<"/[locale]/check">) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale as "en" | "hi");
  const t = await getTranslations("check");
  const { q } = searchSchema.parse(sp);

  const detected = q !== undefined ? detectIdentifier(q) : null;
  const lookup = detected?.ok ? await lookupIdentifiers(detected.lookups) : null;

  const errorKey =
    detected && !detected.ok ? detected.error : lookup && !lookup.ok ? lookup.error : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold leading-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>

      <div className="space-y-2">
        <CheckForm defaultValue={q ?? ""} autoFocus={q === undefined} />
        <p className="text-sm text-muted-foreground">{t("examples")}</p>
      </div>

      {errorKey && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription className="text-base">{t(`errors.${errorKey}`)}</AlertDescription>
        </Alert>
      )}

      {detected?.ok && lookup?.ok && (
        <CheckResult detected={detected} hits={lookup.hits} similar={lookup.similar} />
      )}

      <p className="border-t pt-4 text-xs text-muted-foreground">{t("disclaimer")}</p>
    </div>
  );
}
