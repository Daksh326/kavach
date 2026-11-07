import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// serverEnv() caches env, so each test imports a fresh module graph.
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import("./turnstile");
}

const base = {
  SUPABASE_SECRET_KEY: "sb_secret_test_value_xxxxxxxx",
  TURNSTILE_VERIFY_URL: "https://fake.verify/siteverify",
};

describe("verifyTurnstile", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.restoreAllMocks());

  it("passes when Turnstile isn't configured (local dev)", async () => {
    const { verifyTurnstile } = await load({ ...base, TURNSTILE_SECRET_KEY: "" });
    await expect(verifyTurnstile(undefined)).resolves.toBe(true);
  });

  it("fails closed without a token", async () => {
    const { verifyTurnstile } = await load({ ...base, TURNSTILE_SECRET_KEY: "secret" });
    await expect(verifyTurnstile(undefined)).resolves.toBe(false);
  });

  it("accepts a token Cloudflare confirms, with the right action", async () => {
    const { verifyTurnstile } = await load({ ...base, TURNSTILE_SECRET_KEY: "secret" });
    const f = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ success: true, action: "report" }));
    await expect(verifyTurnstile("tok", "report")).resolves.toBe(true);
    const body = String(f.mock.calls[0][1]!.body);
    expect(body).toContain("secret=secret");
    expect(body).toContain("response=tok");
  });

  it("rejects a token for a different action", async () => {
    const { verifyTurnstile } = await load({ ...base, TURNSTILE_SECRET_KEY: "secret" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true, action: "login" }),
    );
    await expect(verifyTurnstile("tok", "report")).resolves.toBe(false);
  });

  it("fails closed when Cloudflare says no or is unreachable", async () => {
    const { verifyTurnstile } = await load({ ...base, TURNSTILE_SECRET_KEY: "secret" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ success: false }));
    await expect(verifyTurnstile("tok")).resolves.toBe(false);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network"));
    await expect(verifyTurnstile("tok")).resolves.toBe(false);
  });
});
