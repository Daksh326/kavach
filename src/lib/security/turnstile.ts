import "server-only";
import { serverEnv } from "@/lib/env/server";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileEnabled(): boolean {
  return Boolean(serverEnv().TURNSTILE_SECRET_KEY);
}

/**
 * Verifies a Turnstile token server-side. Without a secret configured
 * (local dev) it passes. With one, it FAILS CLOSED: a missing or invalid
 * token, or Cloudflare being unreachable, means "not verified".
 * Tokens are single-use, so each protected action needs a fresh one.
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  expectedAction?: string,
): Promise<boolean> {
  const env = serverEnv();
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token || token.length > 4096) return false;
  try {
    const res = await fetch(env.TURNSTILE_VERIFY_URL ?? SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean; action?: string };
    if (!data.success) return false;
    // When the widget declares an action, it must match the one we expect.
    if (expectedAction && data.action && data.action !== expectedAction) return false;
    return true;
  } catch {
    return false;
  }
}
