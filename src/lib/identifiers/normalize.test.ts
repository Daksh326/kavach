import { describe, expect, it } from "vitest";
import {
  detectIdentifier,
  formatPhone,
  normalizeEmail,
  normalizeIfsc,
  normalizePhone,
  normalizeSocial,
  normalizeUpi,
  normalizeUrl,
} from "./normalize";

describe("normalizePhone", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["98765 43210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["+91-098765 43210", "+919876543210"],
    ["091 9876543210", null], // ambiguous junk
    ["09876543210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["0091 98765 43210", "+919876543210"],
    ["(011) 2345 6789", "+911123456789"], // Delhi landline with STD
    ["+1 415 555 2671", "+14155552671"],
    ["+44 20 7946 0958", "+442079460958"],
    ["12345", null],
    ["0000000000", null],
    ["+91 12345", null],
    ["98765abc10", null],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("formats Indian numbers for display", () => {
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
    expect(formatPhone("+14155552671")).toBe("+14155552671");
  });
});

describe("normalizeUpi", () => {
  it.each([
    ["Rahul.Sharma@OKAXIS", "rahul.sharma@okaxis"],
    ["  9876543210@ybl ", "9876543210@ybl"],
    ["upi://pay?pa=Shop.Owner@paytm&pn=Shop&am=100", "shop.owner@paytm"],
    ["UPI://PAY?pa=abc@ibl", "abc@ibl"],
    ["upi://pay?pn=NoPayee", null],
    ["no-at-sign", null],
    ["a@b", null], // too short
  ])("%s -> %s", (input, expected) => {
    expect(normalizeUpi(input)).toBe(expected);
  });
});

describe("normalizeEmail", () => {
  it.each([
    [" Support@Example.COM ", "support@example.com"],
    ["mailto:help@bank-kyc.in", "help@bank-kyc.in"],
    ["not-an-email", null],
    ["a@b", null],
    ["a@b..com", null],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
});

describe("normalizeUrl", () => {
  it("canonicalises scheme, www, case, query, fragment and trailing slash", () => {
    const r = normalizeUrl("HTTP://WWW.Kyc-Update.example.co.in/Verify/?token=abc#x");
    expect(r).toEqual({
      ok: true,
      value: {
        url: "https://kyc-update.example.co.in/Verify",
        host: "kyc-update.example.co.in",
        domain: "example.co.in",
        hasLookalikeChars: false,
      },
    });
  });

  it("adds https:// to bare domains", () => {
    const r = normalizeUrl("sbi-rewards.top");
    expect(r.ok && r.value.url).toBe("https://sbi-rewards.top");
    expect(r.ok && r.value.domain).toBe("sbi-rewards.top");
  });

  it("keeps path case (shortener codes are case-sensitive)", () => {
    const r = normalizeUrl("https://bit.ly/AbC123");
    expect(r.ok && r.value.url).toBe("https://bit.ly/AbC123");
  });

  it("never treats shared platforms as a reportable domain", () => {
    for (const u of [
      "bit.ly/x",
      "https://wa.me/919876543210",
      "forms.gle/abc",
      "docs.google.com/forms/d/1",
    ]) {
      const r = normalizeUrl(u);
      expect(r.ok && r.value.domain, u).toBeNull();
    }
  });

  it("treats per-tenant hosting as its own domain", () => {
    const r = normalizeUrl("https://sbi-kyc.pages.dev/login");
    expect(r.ok && r.value.domain).toBe("sbi-kyc.pages.dev");
  });

  it("flags look-alike (punycode) hosts", () => {
    // Cyrillic "ѕ" instead of Latin "s"
    const r = normalizeUrl("https://ѕbi.com");
    expect(r.ok && r.value.hasLookalikeChars).toBe(true);
    expect(r.ok && r.value.host.startsWith("xn--")).toBe(true);
  });

  it.each([
    ["javascript:alert(1)", "unsupported_scheme"],
    ["ftp://example.com", "unsupported_scheme"],
    ["http://192.168.1.10/login", "ip_address"],
    ["https://[::1]/", "ip_address"],
    ["localhost", "invalid"],
  ])("rejects %s (%s)", (input, error) => {
    expect(normalizeUrl(input)).toEqual({ ok: false, error });
  });
});

describe("normalizeSocial / normalizeIfsc", () => {
  it("normalises social handles", () => {
    expect(normalizeSocial("Telegram", "@Daily_Task_HR")).toBe("telegram:@daily_task_hr");
    expect(normalizeSocial("instagram", "a")).toBeNull();
  });
  it("normalises IFSC codes", () => {
    expect(normalizeIfsc(" sbin0001234 ")).toBe("SBIN0001234");
    expect(normalizeIfsc("SBIN1001234")).toBeNull(); // 5th char must be 0
  });
});

describe("detectIdentifier", () => {
  it("detects phone numbers", () => {
    expect(detectIdentifier("98765 43210")).toMatchObject({
      ok: true,
      kind: "phone",
      display: "+91 98765 43210",
      lookups: [{ type: "phone", value: "+919876543210" }],
    });
  });

  it("tells UPI and email apart by the dot in the host", () => {
    expect(detectIdentifier("rahul@okaxis")).toMatchObject({ kind: "upi" });
    expect(detectIdentifier("rahul@gmail.com")).toMatchObject({ kind: "email" });
  });

  it("detects UPI QR payloads", () => {
    expect(detectIdentifier("upi://pay?pa=scam@ybl&am=999")).toMatchObject({
      kind: "upi",
      lookups: [{ type: "upi", value: "scam@ybl" }],
    });
  });

  it("looks up both the URL and its domain", () => {
    expect(detectIdentifier("https://www.kyc-update-portal.test/verify?id=9")).toMatchObject({
      kind: "url",
      display: "kyc-update-portal.test",
      lookups: [
        { type: "url", value: "https://kyc-update-portal.test/verify" },
        { type: "domain", value: "kyc-update-portal.test" },
      ],
    });
  });

  it("extracts the phone number from WhatsApp links", () => {
    expect(detectIdentifier("https://wa.me/919876543210?text=hi")).toMatchObject({
      kind: "whatsapp",
      lookups: [{ type: "phone", value: "+919876543210" }],
    });
    expect(detectIdentifier("api.whatsapp.com/send?phone=919876543210")).toMatchObject({
      kind: "whatsapp",
      lookups: [{ type: "phone", value: "+919876543210" }],
    });
  });

  it("extracts the handle from Telegram links", () => {
    expect(detectIdentifier("t.me/Daily_Task_HR")).toMatchObject({
      kind: "telegram",
      lookups: [{ type: "social", value: "telegram:@daily_task_hr" }, { type: "url" }],
    });
  });

  it("only looks up the full link on shared platforms", () => {
    const r = detectIdentifier("https://bit.ly/3xYz");
    expect(r).toMatchObject({
      kind: "url",
      lookups: [{ type: "url", value: "https://bit.ly/3xYz" }],
    });
    expect(r.ok && r.lookups).toHaveLength(1);
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["hello there", "unrecognized"],
    ["1.2.3.4", "ip_address"],
    ["x".repeat(600), "too_long"],
  ])("rejects %j (%s)", (input, error) => {
    expect(detectIdentifier(input)).toEqual({ ok: false, error });
  });
});
