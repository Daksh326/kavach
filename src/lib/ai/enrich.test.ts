import { describe, expect, it } from "vitest";
import { regexIdentifiers } from "./enrich";

describe("regexIdentifiers", () => {
  it("finds links, UPI IDs and Indian mobile numbers", () => {
    const found = regexIdentifiers(
      "Update KYC: https://sbi-kyc.example.top/login. Or pay refund.desk@ybl, call +91 98765 43210 or 08765432109. wa.me/919876543210",
    );
    expect(found).toEqual(
      expect.arrayContaining([
        "https://sbi-kyc.example.top/login",
        "wa.me/919876543210",
        "refund.desk@ybl",
        "+91 98765 43210",
        "08765432109",
      ]),
    );
  });

  it("does not treat emails as UPI IDs or redaction labels as numbers", () => {
    const found = regexIdentifiers(
      "Mail help@bank-support.com. OTP [code removed] and [number removed]",
    );
    expect(found).toEqual([]);
  });
});
