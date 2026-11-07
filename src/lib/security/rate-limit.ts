import "server-only";
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { serverEnv } from "@/lib/env/server";

/**
 * Every rate limit in one place. Keys are user ids or HMAC'd IPs (never raw).
 * Without Upstash configured (local dev), limits are not enforced.
 * If Upstash is down or slow, requests are ALLOWED (fail open): a scam
 * victim must never be locked out by our infrastructure. The DB has its own
 * backstop (e.g. 20 reports/user/day in submit_report).
 */
export const POLICIES = {
  reportUser: { limit: 5, window: "1 h" },
  reportIp: { limit: 10, window: "1 h" },
  analyseActor: { limit: 10, window: "10 m" },
  analyseDaily: { limit: 60, window: "1 d" },
  flagIp: { limit: 10, window: "1 h" },
  otpIp: { limit: 6, window: "10 m" },
  uploadUser: { limit: 40, window: "1 h" },
  lookupIp: { limit: 60, window: "1 m" },
} as const satisfies Record<string, { limit: number; window: Duration }>;

export type Policy = keyof typeof POLICIES;

let redis: Redis | null | undefined;
const limiters = new Map<Policy, Ratelimit>();

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const env = serverEnv();
  redis =
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? new Redis({
          url: env.UPSTASH_REDIS_REST_URL,
          token: env.UPSTASH_REDIS_REST_TOKEN,
          enableTelemetry: false,
        })
      : null;
  return redis;
}

function limiter(policy: Policy): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  let l = limiters.get(policy);
  if (!l) {
    const { limit, window } = POLICIES[policy];
    l = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `kavach:rl:${policy}`,
      timeout: 1500, // allow the request if Upstash doesn't answer in time
      analytics: false,
    });
    limiters.set(policy, l);
  }
  return l;
}

/** True if every [policy, key] pair is within its limit. */
export async function withinLimits(...checks: [Policy, string][]): Promise<boolean> {
  const results = await Promise.all(
    checks.map(async ([policy, key]) => {
      const l = limiter(policy);
      if (!l) return true;
      try {
        return (await l.limit(key)).success;
      } catch (e) {
        console.error(
          "rate limit check failed (allowing)",
          policy,
          e instanceof Error ? e.name : e,
        );
        return true;
      }
    }),
  );
  return results.every(Boolean);
}
