import { defineRouting } from "next-intl/routing";

export const locales = ["en", "hi"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  // Every URL carries its locale (/en/emergency, /hi/emergency). Unprefixed
  // URLs get ONE redirect to the visitor's language (cookie, then
  // Accept-Language). We deliberately avoid "as-needed": it makes the proxy
  // REWRITE requests, and on OpenNext/Cloudflare, Server Actions and
  // redirect() break on rewritten routes. Redirect-only routing is robust.
  localePrefix: "always",
});
