import "server-only";
import { z } from "zod";

/**
 * Server-only secrets. Importing this file from a Client Component fails the
 * build (server-only), so secrets can never reach the browser bundle.
 *
 * On Cloudflare, OpenNext fills process.env from Wrangler secrets/vars at
 * request time; locally it comes from .env.local (next dev) or .dev.vars
 * (wrangler dev). Feature secrets are optional here and asserted with
 * requireServerEnv() where they are used, so an unconfigured feature fails
 * with a clear message instead of crashing the whole app.
 */
const schema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
  CRON_SECRET: z.string().min(32).optional(),

  // Phase 3: evidence storage (Cloudflare R2, S3-compatible API for presigned URLs)
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  // Only for local S3-compatible emulators; production derives the R2 endpoint.
  R2_ENDPOINT: z.url().optional(),
  R2_REGION: z.string().min(1).optional(),

  // Phase 4: AI analysis
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
  // Test-only override of https://generativelanguage.googleapis.com (local fake server).
  GEMINI_API_BASE: z.url().optional(),

  // Phase 5: abuse protection, email, monitoring
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  // Test-only override of Cloudflare's siteverify endpoint (local fake).
  TURNSTILE_VERIFY_URL: z.url().optional(),
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  RATE_LIMIT_SALT: z.string().min(16).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).optional(),
  SENTRY_DSN: z.url().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const raw = Object.fromEntries(
    Object.keys(schema.shape).map((k) => [k, process.env[k] || undefined]),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables (see .env.example):\n${z.prettifyError(parsed.error)}`,
    );
  }
  cached = parsed.data;
  return cached;
}

/** Returns the named variables, throwing a clear config error if any are missing. */
export function requireServerEnv<K extends keyof ServerEnv>(
  ...keys: K[]
): { [P in K]-?: NonNullable<ServerEnv[P]> } {
  const env = serverEnv();
  const missing = keys.filter((k) => env[k] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing server configuration: ${missing.join(", ")}`);
  }
  return env as unknown as { [P in K]-?: NonNullable<ServerEnv[P]> };
}
