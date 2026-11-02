import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";

// Static (no session read) so every public page can be prerendered.
export async function SiteHeader() {
  const t = await getTranslations("common");
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-2 px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-primary">
          <ShieldCheck className="size-6" aria-hidden />
          {t("appName")}
        </Link>
        <nav className="flex items-center gap-1">
          <LanguageSwitcher label={t("switchLanguage")} ariaLabel={t("switchLanguageLabel")} />
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-accent"
          >
            {t("dashboard")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
