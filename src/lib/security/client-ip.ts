import "server-only";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env/server";

/** The caller's IP as Cloudflare reports it (never trust X-Forwarded-For first). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

let keyPromise: Promise<CryptoKey> | undefined;

/**
 * HMAC of the IP, so raw IPs are never stored in Redis or logs. Keyed with
 * RATE_LIMIT_SALT (falls back to a key derived from the server secret).
 */
export async function hashIp(ip: string): Promise<string> {
  keyPromise ??= (() => {
    const env = serverEnv();
    const secret = env.RATE_LIMIT_SALT ?? `ip-hash:${env.SUPABASE_SECRET_KEY}`;
    return crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  })();
  const sig = await crypto.subtle.sign("HMAC", await keyPromise, new TextEncoder().encode(ip));
  return [...new Uint8Array(sig)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function clientIpHash(): Promise<string> {
  return hashIp(await clientIp());
}
