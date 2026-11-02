import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <section className="space-y-4 text-center">
      <h1 className="text-2xl font-bold">{t("notFound.title")}</h1>
      <p className="text-muted-foreground">{t("notFound.body")}</p>
      <Link
        href="/"
        className="inline-flex h-11 items-center text-primary underline underline-offset-4"
      >
        {t("common.backHome")}
      </Link>
    </section>
  );
}
