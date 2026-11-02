import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env/public";
import { safeNextPath } from "@/lib/validation/auth";
import { routing } from "@/i18n/routing";

/** OAuth (Google) PKCE callback: exchanges ?code for a session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath.parse(searchParams.get("next") ?? undefined);
  const locale = searchParams.get("locale") === "hi" ? "hi" : routing.defaultLocale;
  const prefix = `/${locale}`;
  // Build redirects from the configured site URL, never from the Host header.
  const site = publicEnv.NEXT_PUBLIC_SITE_URL;

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(`${prefix}${next}`, site));
      }
    } catch {
      // fall through to the error redirect
    }
  }
  return NextResponse.redirect(new URL(`${prefix}/login?error=oauthFailed`, site));
}
