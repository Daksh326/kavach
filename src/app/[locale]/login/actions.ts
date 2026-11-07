"use server";

import { redirect as redirectExternal } from "next/navigation";
import { getLocale } from "next-intl/server";
import type { AuthError } from "@supabase/supabase-js";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env/public";
import { emailSchema, otpSchema, safeNextPath } from "@/lib/validation/auth";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { clientIpHash } from "@/lib/security/client-ip";
import { withinLimits } from "@/lib/security/rate-limit";
import { actionMetaSchema } from "@/lib/validation/meta";

function authErrorKey(error: AuthError): string {
  if (error.status === 429 || error.code?.startsWith("over_")) return "tooManyAttempts";
  if (error.code === "captcha_failed") return "botCheckFailed";
  if (error.code === "otp_expired" || error.status === 403 || error.status === 400)
    return "wrongCode";
  return "serviceUnavailable";
}

export async function sendOtp(
  input: { email: string },
  meta?: unknown,
): Promise<ActionResult<{ email: string }>> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return fail("invalidEmail");
  const { turnstileToken } = actionMetaSchema.parse(meta) ?? {};

  if (!(await withinLimits(["otpIp", await clientIpHash()]))) return fail("tooManyAttempts");

  const locale = await getLocale();
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        shouldCreateUser: true,
        // Copied into profiles.language by the auth.users trigger.
        data: { language: locale },
        // Turnstile token, verified by Supabase Auth itself when its captcha
        // protection is enabled (so calling Auth directly can't bypass it).
        captchaToken: turnstileToken || undefined,
      },
    });
    if (error) return fail(authErrorKey(error));
  } catch {
    return fail("serviceUnavailable");
  }
  return ok({ email: parsed.data.email });
}

export async function verifyOtp(input: {
  email: string;
  token: string;
  next?: string;
}): Promise<ActionResult> {
  const parsed = otpSchema.safeParse(input);
  if (!parsed.success) return fail("invalidCode");

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: parsed.data.email,
      token: parsed.data.token,
      type: "email",
    });
    if (error) return fail(authErrorKey(error));
  } catch {
    return fail("serviceUnavailable");
  }

  // redirect() throws, so it must be outside try/catch.
  const locale = await getLocale();
  redirect({ href: safeNextPath.parse(input.next), locale });
  return ok(undefined);
}

export async function signInWithGoogle(input: { next?: string }): Promise<ActionResult> {
  const next = safeNextPath.parse(input.next);
  const locale = await getLocale();
  const callback = new URL("/auth/callback", publicEnv.NEXT_PUBLIC_SITE_URL);
  callback.searchParams.set("next", next);
  callback.searchParams.set("locale", locale);

  let url: string | undefined;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
    if (error) return fail("oauthFailed");
    url = data.url;
  } catch {
    return fail("serviceUnavailable");
  }
  if (!url) return fail("oauthFailed");

  redirectExternal(url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut().catch(() => undefined);
  const locale = await getLocale();
  redirect({ href: "/", locale });
}
