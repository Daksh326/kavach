import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { RedFlags } from "@/components/red-flags";

// Phase 2 placeholder. Phase 4 adds the Gemini-backed analyser here and reads
// the draft handed off by the home page (sessionStorage "kavach:analyse-draft").
export async function generateMetadata({
  params,
}: PageProps<"/[locale]/analyse">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as "en" | "hi", namespace: "analyse" });
  return { title: t("metaTitle") };
}

export default async function AnalysePage({ params }: PageProps<"/[locale]/analyse">) {
  const { locale } = await params;
  setRequestLocale(locale as "en" | "hi");
  const t = await getTranslations();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("analyse.title")}</h1>
      <p>{t("analyse.comingSoon")}</p>
      <RedFlags />
      <Link
        href="/check"
        className="flex h-12 items-center justify-center rounded-lg border-2 border-primary px-4 font-semibold text-primary"
      >
        {t("home.checkTitle")}
      </Link>
    </div>
  );
}
