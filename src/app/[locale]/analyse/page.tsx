import type { Metadata } from "next";
import { ClientMessages } from "@/i18n/client-messages";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AnalyseLoader } from "@/components/analyse/analyse-loader";
import { RedFlags } from "@/components/red-flags";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/analyse">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as "en" | "hi", namespace: "analyse" });
  return { title: t("metaTitle"), description: t("intro") };
}

// Static shell; the analyser itself is a client island.
export default async function AnalysePage({ params }: PageProps<"/[locale]/analyse">) {
  const { locale } = await params;
  setRequestLocale(locale as "en" | "hi");
  const t = await getTranslations("analyse");
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>
      <ClientMessages namespaces={["analyse", "categories"]}>
        <AnalyseLoader />
      </ClientMessages>
      <RedFlags />
    </div>
  );
}
