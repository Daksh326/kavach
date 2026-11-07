import { describe, expect, it } from "vitest";
import { buildEnvelope, buildEvent, parseDsn, parseStack, scrubText } from "./sentry-core";

describe("sentry-core", () => {
  it("parses a DSN into the envelope endpoint", () => {
    expect(parseDsn("https://abc123@o42.ingest.sentry.io/7890")).toEqual({
      publicKey: "abc123",
      envelopeUrl: "https://o42.ingest.sentry.io/api/7890/envelope/",
      raw: "https://abc123@o42.ingest.sentry.io/7890",
    });
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn("not a url")).toBeNull();
    expect(parseDsn("https://o42.ingest.sentry.io/7890")).toBeNull(); // no key
  });

  it("scrubs emails, UPI IDs, phone-like numbers and query strings", () => {
    expect(
      scrubText(
        "Failed for asha@example.com / pay@ybl at +91 98765 43210 on /en/check?q=6000000101",
      ),
    ).toBe("Failed for [email] / [upi] at [number] on /en/check?[query]");
  });

  it("parses V8 stacks oldest-first", () => {
    const stack =
      "Error: boom\n    at inner (https://x.dev/_next/static/a.js:10:5)\n    at outer (https://x.dev/_next/static/b.js:20:7)";
    const frames = parseStack(stack);
    expect(frames.map((f) => f.function)).toEqual(["outer", "inner"]);
    expect(frames[1]).toMatchObject({ lineno: 10, colno: 5 });
  });

  it("builds an event with no user or IP and a 3-line envelope", () => {
    const event = buildEvent({
      error: new Error("bad thing for 9876543210"),
      platform: "javascript",
      environment: "test",
      path: "/en/report/x?y=1",
    });
    expect(event).not.toHaveProperty("user");
    expect(event.exception.values[0]).toMatchObject({
      type: "Error",
      value: "bad thing for [number]",
    });
    expect(event.transaction).toBe("/en/report/x?[query]");
    const lines = buildEnvelope(parseDsn("https://k@h.io/1")!, event).split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[1])).toEqual({ type: "event" });
    expect(JSON.parse(lines[0]).event_id).toBe(event.event_id);
  });

  it("wraps non-Error values", () => {
    expect(
      buildEvent({ error: "plain string", platform: "node", environment: "t" }).exception.values[0]
        .value,
    ).toBe("plain string");
  });
});
