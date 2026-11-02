import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import hi from "../../../messages/hi.json";
import {
  buildBankLetter,
  buildPortalComplaint,
  formatInr,
  type ComplaintData,
  type ComplaintLabels,
} from "./build";

const labelsFor = (m: typeof en): ComplaintLabels => ({
  category: m.categories,
  channel: m.channels,
  paymentMethod: m.paymentMethods,
  identifierType: {
    phone: m.check.kinds.phone,
    upi: m.check.kinds.upi,
    url: m.check.kinds.url,
    domain: m.check.kinds.domain,
    email: m.check.kinds.email,
    social: m.check.kinds.social,
    bank_ifsc: m.check.kinds.bank_ifsc,
  },
});

const base: ComplaintData = {
  reportId: "3f2a9c10-0000-4000-8000-000000000000",
  createdAt: "2026-10-12T10:00:00Z",
  category: "kyc_bank_impersonation",
  channel: "phone_call",
  description: "Caller said my account would be blocked.",
  amountLost: 150000,
  incidentDate: "2026-10-12",
  paymentMethod: "upi",
  bankAccountLast4: "4321",
  transactionRef: "412345678901",
  identifiers: [
    { type: "phone", value: "+919876543210" },
    { type: "url", value: "https://kyc-update.example.in/verify" },
    { type: "domain", value: "example.in" },
    { type: "upi", value: "refund.desk@okfake" },
  ],
  evidence: [{ fileName: "chat.png", sha256: "a".repeat(64) }],
};

describe("complaint text", () => {
  it("formats rupees the Indian way", () => {
    expect(formatInr(150000, "en")).toBe("₹1,50,000");
  });

  it("builds the portal complaint with every fact", () => {
    const text = buildPortalComplaint(base, "en", labelsFor(en));
    expect(text).toContain("Type of fraud: Fake bank / KYC update");
    expect(text).toContain("Date of incident: 12 October 2026");
    expect(text).toContain("Amount lost: ₹1,50,000 via UPI");
    expect(text).toContain("Transaction ID / UTR: 412345678901");
    expect(text).toContain("- Phone number: +91 98765 43210");
    expect(text).toContain("- UPI ID: refund.desk@okfake");
    expect(text).toContain(`1. chat.png – ${"a".repeat(64)}`);
    expect(text).toContain("freeze the accounts that received my money");
    expect(text).toContain("Kavach report reference: 3F2A9C10");
  });

  it("hides a domain already covered by a listed URL", () => {
    const text = buildPortalComplaint(base, "en", labelsFor(en));
    expect(text).not.toMatch(/^- Website: example\.in$/m);
    expect(text).toContain("- Website: https://kyc-update.example.in/verify");
  });

  it("handles a report with no money lost and nothing optional", () => {
    const text = buildPortalComplaint(
      {
        ...base,
        amountLost: null,
        paymentMethod: null,
        transactionRef: null,
        bankAccountLast4: null,
        incidentDate: null,
        identifiers: [],
        evidence: [],
        description: "",
      },
      "en",
      labelsFor(en),
    );
    expect(text).toContain("Amount lost: No money lost");
    expect(text).toContain("Date of incident: Not sure");
    expect(text).toContain("I do not have the fraudster's details.");
    expect(text).toContain("[Describe what happened in your own words.]");
    expect(text).toContain("block the numbers, accounts and websites");
    expect(text).not.toContain("Transaction ID");
  });

  it("builds the bank letter with placeholders when details are missing", () => {
    const letter = buildBankLetter(
      { ...base, bankAccountLast4: null, transactionRef: null },
      "en",
      labelsFor(en),
    );
    expect(letter).toContain("account ending in [last 4 digits]");
    expect(letter).toContain("[add the transaction ID / UTR from your bank SMS]");
    expect(letter).toContain("₹1,50,000 was debited from my account through UPI");
    expect(letter).toContain("DBR.No.Leg.BC.78/09.07.005/2017-18");
  });

  it("builds Hindi versions with Hindi labels", () => {
    const text = buildPortalComplaint(base, "hi", labelsFor(hi as unknown as typeof en));
    expect(text).toContain("धोखाधड़ी का प्रकार: नकली बैंक / KYC अपडेट");
    expect(text).toContain("12 अक्टूबर 2026");
    const letter = buildBankLetter(base, "hi", labelsFor(hi as unknown as typeof en));
    expect(letter).toContain("महोदय/महोदया");
  });
});
