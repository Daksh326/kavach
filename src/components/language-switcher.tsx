"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export function LanguageSwitcher({ label, ariaLabel }: { label: string; ariaLabel: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const other = locale === "en" ? "hi" : "en";
  return (
    <Link
      href={pathname}
      locale={other}
      lang={other}
      aria-label={ariaLabel}
      className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-accent"
    >
      {label}
    </Link>
  );
}
