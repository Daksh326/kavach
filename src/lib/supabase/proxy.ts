import type { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { publicEnv } from "@/lib/env/public";
import type { Database } from "./database.types";

type PendingCookie = { name: string; value: string; options: CookieOptions };

/** True if the request carries a Supabase auth cookie. */
export function hasSupabaseSession(request: NextRequest) {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
}

/**
 * Refreshes the Supabase session (if needed) BEFORE the response is created.
 * Refreshed cookies are written onto the request (so Server Components in this
 * same request see them) and returned so the caller can copy them onto
 * whatever response it builds.
 */
export async function refreshSession(request: NextRequest) {
  const pending: PendingCookie[] = [];
  let cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          pending.push(...cookiesToSet);
          cacheHeaders = { ...cacheHeaders, ...headers };
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims(): this call is
  // what validates/refreshes the token.
  await supabase.auth.getClaims();

  return function applyTo(response: NextResponse) {
    pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    // Responses that set auth cookies must never be cached by a CDN.
    Object.entries(cacheHeaders).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  };
}
