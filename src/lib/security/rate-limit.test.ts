import { describe, expect, it, vi } from "vitest";

/**
 * Integration test against a real Redis behind an Upstash-compatible REST
 * endpoint. Runs only when RL_TEST_UPSTASH_URL/TOKEN are set, e.g.:
 *   docker run -d --name redis redis:7-alpine
 *   docker run -d -p 8079:80 -e SRH_MODE=env -e SRH_TOKEN=t -e SRH_CONNECTION_STRING=redis://redis:6379 hiett/serverless-redis-http
 *   node scripts/dev/upstash-shim.mjs   # serves :8078, see the file for why
 * then RL_TEST_UPSTASH_URL=http://127.0.0.1:8078 RL_TEST_UPSTASH_TOKEN=t pnpm test
 */
const url = process.env.RL_TEST_UPSTASH_URL;
const token = process.env.RL_TEST_UPSTASH_TOKEN;

describe.skipIf(!url)("withinLimits (real Redis)", () => {
  it("allows up to the limit, then blocks", async () => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_value_xxxxxxxx");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", url!);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", token!);
    const { withinLimits, POLICIES } = await import("./rate-limit");
    const key = `test-${crypto.randomUUID()}`;
    const results: boolean[] = [];
    for (let i = 0; i < POLICIES.flagIp.limit + 2; i++)
      results.push(await withinLimits(["flagIp", key]));
    expect(results.filter(Boolean)).toHaveLength(POLICIES.flagIp.limit);
    expect(results.at(-1)).toBe(false);
    // A different key is unaffected.
    expect(await withinLimits(["flagIp", `${key}-other`])).toBe(true);
  });

  it("fails open when Redis is unreachable", async () => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_value_xxxxxxxx");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "http://127.0.0.1:1");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "x");
    const { withinLimits } = await import("./rate-limit");
    expect(await withinLimits(["flagIp", "anything"])).toBe(true);
  });
});
