import { ChevronRight, FilePen, Phone, Siren } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CheckForm } from "@/components/check/check-form";
import { AnalyseBox } from "@/components/home/analyse-box";
import { RedFlags } from "@/components/red-flags";

// Fully static (prerendered per locale): no cookies, headers or searchParams.
export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as "en" | "hi");
  const t = await getTranslations("home");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="space-y-3">
        <Link
          href="/emergency"
          className="flex min-h-20 w-full items-center gap-4 rounded-2xl bg-destructive p-4 text-destructive-foreground shadow-sm active:scale-[0.99]"
        >
          <Siren className="size-9 shrink-0" aria-hidden />
          <span className="flex-1">
            <span className="block text-xl font-bold">{t("scammedButton")}</span>
            <span className="block text-sm opacity-90">{t("scammedHint")}</span>
          </span>
          <ChevronRight className="size-6 shrink-0" aria-hidden />
        </Link>
        <Link
          href="/report"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-primary font-semibold text-primary"
        >
          <FilePen className="size-5" aria-hidden />
          {t("reportButton")}
        </Link>
        <a
          href="tel:1930"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-destructive font-semibold text-destructive"
        >
          <Phone className="size-5" aria-hidden />
          {t("call1930")}
        </a>
      </div>

      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <div>
          <h2 className="text-lg font-bold">{t("checkTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("checkHint")}</p>
        </div>
        <CheckForm />
      </section>

      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <div>
          <h2 className="text-lg font-bold">{t("analyseTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("analyseHint")}</p>
        </div>
        <AnalyseBox />
      </section>

      <RedFlags />
    </div>
  );
}
