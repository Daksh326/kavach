import { describe, expect, it } from "vitest";
import { stripSensitive, verhoeffValid } from "./sensitive";

describe("stripSensitive", () => {
  it("removes Luhn-valid card numbers in any grouping", () => {
    for (const card of [
      "4111111111111111",
      "4111 1111 1111 1111",
      "4111-1111-1111-1111",
      "5500005555555559",
    ]) {
      const r = stripSensitive(`My card ${card} was charged`);
      expect(r.text, card).toBe("My card [card number removed] was charged");
      expect(r.removed).toEqual(["card"]);
    }
  });

  it("keeps non-Luhn long numbers, phones and 12-digit UTRs", () => {
    const text = "Paid via UPI, UTR 412345678901. Caller +91 98765 43210. Order 1234567890123";
    const r = stripSensitive(text);
    expect(r.text).toBe(text);
    expect(r.removed).toEqual([]);
  });

  it("removes CVV next to its keyword", () => {
    expect(stripSensitive("he asked my CVV: 123 and expiry").text).toBe(
      "he asked my CVV: [CVV removed] and expiry",
    );
  });

  it("removes OTPs and PINs in English and Hindi", () => {
    expect(stripSensitive("I told him the OTP 482913 by mistake").text).toBe(
      "I told him the OTP [code removed] by mistake",
    );
    expect(stripSensitive("my upi pin is 4821").text).toBe("my upi pin is [code removed]");
    expect(stripSensitive("मैंने ओटीपी 482913 बता दिया").text).toBe(
      "मैंने ओटीपी [code removed] बता दिया",
    );
    expect(stripSensitive("verification code was 9182").removed).toEqual(["otp"]);
  });

  it("keeps postal PIN codes", () => {
    const text = "I live in Delhi, pin code 110001";
    expect(stripSensitive(text).text).toBe(text);
  });

  it("removes passwords", () => {
    expect(stripSensitive("net banking password: Secret@123 then").text).toBe(
      "net banking password: [password removed] then",
    );
    expect(stripSensitive("पासवर्ड है abc123").text).toBe("पासवर्ड है [password removed]");
  });

  it("reduces full account numbers to the last 4 digits", () => {
    const r = stripSensitive("money went from my account no. 123456789012 to theirs");
    expect(r.text).toBe("money went from my account no. [account ending 9012] to theirs");
    expect(r.removed).toEqual(["bank_account"]);
    expect(stripSensitive("खाता संख्या 50100123456789").text).toBe(
      "खाता संख्या [account ending 6789]",
    );
  });

  it("removes Aadhaar numbers with keyword or in printed form", () => {
    expect(stripSensitive("my aadhaar 2345 6789 0123 was asked").removed).toEqual(["aadhaar"]);
    // Printed form only when the Verhoeff checksum passes
    const valid = "4991 1866 5246"; // checksum-valid test number
    expect(verhoeffValid(valid.replace(/ /g, ""))).toBe(true);
    expect(stripSensitive(`card ${valid}`).text).toBe("card [Aadhaar number removed]");
    expect(stripSensitive("ref 4991 1866 5247").text).toBe("ref 4991 1866 5247");
  });

  it("handles several kinds at once and reports each once", () => {
    const r = stripSensitive("OTP 1234, OTP 5678, card 4111111111111111");
    expect(r.removed.sort()).toEqual(["card", "otp"]);
  });
});
