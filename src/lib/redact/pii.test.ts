import { describe, expect, it } from "vitest";
import { redactForAI } from "./pii";

describe("redactForAI", () => {
  it("keeps what the analysis needs: scammer phone, UPI, link, wording", () => {
    const msg =
      "Your SBI account will be blocked today. Update KYC at http://sbi-kyc.example.top or call 9876543210. Pay Rs 10 to refund.desk@ybl";
    expect(redactForAI(msg)).toEqual({ text: msg, removed: [] });
  });

  it("removes secrets via the shared stripper", () => {
    const r = redactForAI("OTP 482913 is for txn. Card 4111 1111 1111 1111");
    expect(r.text).toBe("OTP [code removed] is for txn. Card [card number removed]");
    expect(r.removed.sort()).toEqual(["card", "otp"]);
  });

  it("removes PAN numbers", () => {
    const r = redactForAI("Your PAN ABCPE1234F is linked");
    expect(r.text).toBe("Your PAN [PAN removed] is linked");
    expect(r.removed).toEqual(["pan"]);
  });

  it("removes long bare numbers but keeps phone forms", () => {
    const r = redactForAI("Customer ID 50100123456788 call 919876543210 or 09876543210");
    expect(r.text).toBe("Customer ID [number removed] call 919876543210 or 09876543210");
  });

  it("removes the signed-in user's own email, phone and name", () => {
    const r = redactForAI(
      "Hello asha verma, your number +91 98111-22233 and ASHA.V@example.com are blocked. Asha, act now",
      { name: "Asha Verma", email: "asha.v@example.com", phone: "+919811122233" },
    );
    expect(r.text).toBe(
      "Hello [name], your number [your number] and [your email] are blocked. [name], act now",
    );
    expect(r.removed.sort()).toEqual(["own_email", "own_name", "own_phone"]);
  });

  it("does not redact a name inside another word", () => {
    expect(redactForAI("Ravindra paid", { name: "Ravi" }).text).toBe("Ravindra paid");
  });

  it("removes names in English greetings but not generic ones", () => {
    expect(redactForAI("Dear Rahul Sharma, your parcel is held").text).toBe(
      "Dear [name], your parcel is held",
    );
    expect(redactForAI("Hi Mr. Kumar, pay now").text).toBe("Hi Mr. [name], pay now");
    expect(redactForAI("Dear Customer, your KYC expired").text).toBe(
      "Dear Customer, your KYC expired",
    );
    expect(redactForAI("Dear Valued Member, claim prize").text).toBe(
      "Dear Valued Member, claim prize",
    );
  });

  it("removes names in Hindi greetings but not generic ones", () => {
    expect(redactForAI("प्रिय राहुल जी, आपका खाता बंद होगा").text).toBe(
      "प्रिय [name] जी, आपका खाता बंद होगा",
    );
    expect(redactForAI("प्रिय ग्राहक, आपका KYC समाप्त").text).toBe("प्रिय ग्राहक, आपका KYC समाप्त");
  });
});
