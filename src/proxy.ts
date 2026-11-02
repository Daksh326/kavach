import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { hasSupabaseSession, refreshSession } from "@/lib/supabase/proxy";

const intl = createIntlMiddleware(routing);

/** Routes that need a signed-in user (locale prefix stripped). */
const PROTECTED_PREFIXES = ["/dashboard", "/admin"];
/** /report/<id> is private; /report itself (the wizard) is public. */
const isProtected = (path: string) =>
  PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) ||
  /^\/report\/[^/]+/.test(path);

function splitLocale(pathname: string) {
  const [, first, ...rest] = pathname.split("/");
  if ((routing.locales as readonly string[]).includes(first)) {
    return { locale: first, path: `/${rest.join("/")}` };
  }
  return { locale: undefined, path: pathname };
}

export async function proxy(request: NextRequest) {
  const signedIn = hasSupabaseSession(request);
  const { locale, path } = splitLocale(request.nextUrl.pathname);

  // Unprefixed URL (e.g. /emergency): next-intl redirects to /<locale>/...
  // We never rewrite (see i18n/routing.ts).
  if (!locale) return intl(request);

  // Fast path for signed-out visitors on protected pages: a real 307 to
  // /login before any rendering. The page's DAL check stays the actual
  // security boundary; this only avoids a wasted render.
  if (!signedIn && isProtected(path)) {
    const url = new URL(`/${locale}/login`, request.url);
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Most visitors (victims looking for help) are signed out: skip Supabase
  // entirely for them so public pages cost no auth round-trip.
  if (!signedIn) return intl(request);

  // Refresh first so the refreshed cookies are on the request that next-intl
  // forwards to Server Components, then copy them onto the final response.
  const applyCookies = await refreshSession(request);
  return applyCookies(intl(request));
}

export const config = {
  // Everything except API routes, the auth callback, Next internals and files.
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
