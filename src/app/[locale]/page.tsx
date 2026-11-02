import { Phone } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

// Phase 1 placeholder. Phase 2 builds the real home page.
export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as "en" | "hi");
  const t = await getTranslations("home");

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold leading-tight">{t("title")}</h1>
      <p className="text-lg text-muted-foreground">{t("subtitle")}</p>
      <a
        href="tel:1930"
        className="flex h-16 w-full items-center justify-center gap-3 rounded-xl bg-destructive text-xl font-bold text-destructive-foreground shadow-sm active:scale-[0.99]"
      >
        <Phone className="size-6" aria-hidden />
        {t("call1930")}
      </a>
      <p className="text-sm text-muted-foreground">{t("comingSoon")}</p>
    </section>
  );
}
