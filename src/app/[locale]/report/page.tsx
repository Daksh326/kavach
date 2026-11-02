import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ReportWizardLoader } from "@/components/report/report-wizard-loader";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/report">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as "en" | "hi", namespace: "report" });
  return { title: t("metaTitle"), description: t("intro") };
}

// Static shell. Anyone can fill in the wizard; signing in is only needed to submit.
export default async function ReportPage({ params }: PageProps<"/[locale]/report">) {
  const { locale } = await params;
  setRequestLocale(locale as "en" | "hi");
  const t = await getTranslations("report");
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>
      <ReportWizardLoader />
    </div>
  );
}
