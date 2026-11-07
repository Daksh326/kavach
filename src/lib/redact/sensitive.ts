/**
 * Removes secrets that must never be stored (privacy rules):
 * full card numbers, CVV, OTP/PIN codes, passwords, full bank account
 * numbers, Aadhaar numbers. Pure and dependency-free: runs on the server
 * (authoritative, before saving) and in the browser (to warn the user).
 *
 * Deliberately KEPT: phone numbers, UPI IDs, links and transaction IDs/UTRs
 * (12 digits) — those are what complaints and lookups need.
 */
export type SensitiveKind = "card" | "cvv" | "otp" | "password" | "bank_account" | "aadhaar";

export type StripResult = { text: string; removed: SensitiveKind[] };

export const REDACTION_LABELS: Record<SensitiveKind, string> = {
  card: "[card number removed]",
  cvv: "[CVV removed]",
  otp: "[code removed]",
  password: "[password removed]",
  bank_account: "[account number removed]",
  aadhaar: "[Aadhaar number removed]",
};

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// Verhoeff checksum (used by Aadhaar).
const V_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const V_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export function verhoeffValid(digits: string): boolean {
  let c = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) c = V_D[c][V_P[i % 8][Number(rev[i])]];
  return c === 0;
}

const SEP = String.raw`[ \-]?`;

export function stripSensitive(input: string): StripResult {
  const removed = new Set<SensitiveKind>();
  let text = input;

  // 0) Full bank account numbers (9-18 digits) next to an account keyword.
  //    Keep the last 4 digits, which is all we ever store.
  text = text.replace(
    /(\b(?:a\/c|acct|account|account number|account no\.?|ac no\.?)\b|खाता(?: संख्या| नंबर)?)([^\d\n]{0,20})(\d(?:[ -]?\d){8,17})(?!\d)/gi,
    (m, kw: string, gap: string, num: string) => {
      const digits = num.replace(/\D/g, "");
      if (digits.length < 9 || digits.length > 18) return m;
      removed.add("bank_account");
      return `${kw}${gap}[account ending ${digits.slice(-4)}]`;
    },
  );

  // 1) Card numbers: 13-19 digits (optionally grouped), Luhn-valid.
  text = text.replace(new RegExp(String.raw`(?<!\d)\d(?:${SEP}\d){12,18}(?!\d)`, "g"), (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      removed.add("card");
      return REDACTION_LABELS.card;
    }
    return m;
  });

  // 2) CVV next to its keyword.
  text = text.replace(
    /\b(cvv2?|cvc|card verification|security code)\b([^\d\n]{0,15})(\d{3,4})(?!\d)/gi,
    (_m, kw: string, gap: string) => {
      removed.add("cvv");
      return `${kw}${gap}${REDACTION_LABELS.cvv}`;
    },
  );

  // 3) OTP / PIN / verification codes next to their keyword ("pin code" = postal, kept).
  text = text.replace(
    /(\b(?:otp|one[- ]time password|verification code|security code|(?<!(?:pin|postal|zip)\s*)code|m?pin(?!\s*code)|upi pin|atm pin)\b|ओटीपी|पिन|कोड)([^\d\n]{0,20})(\d{4,8})(?!\d)/gi,
    (_m, kw: string, gap: string) => {
      removed.add("otp");
      return `${kw}${gap}${REDACTION_LABELS.otp}`;
    },
  );

  // 4) Passwords: the token after the keyword.
  text = text.replace(
    /(\b(?:password|passcode|passwd|pwd|login password)\b|पासवर्ड)(\s*(?:is|was|:|=|-|है)?\s*)(\S+)/gi,
    (_m, kw: string, gap: string) => {
      removed.add("password");
      return `${kw}${gap}${REDACTION_LABELS.password}`;
    },
  );

  // 6) Aadhaar: with keyword, or the printed "XXXX XXXX XXXX" form if checksum-valid.
  text = text.replace(
    /(\b(?:aadhaar|aadhar|adhaar|uid|uidai)\b|आधार)([^\d\n]{0,20})([2-9]\d{3}[ -]?\d{4}[ -]?\d{4})(?!\d)/gi,
    (_m, kw: string, gap: string) => {
      removed.add("aadhaar");
      return `${kw}${gap}${REDACTION_LABELS.aadhaar}`;
    },
  );
  text = text.replace(/(?<!\d)([2-9]\d{3}) (\d{4}) (\d{4})(?!\d)/g, (m) => {
    if (!verhoeffValid(m.replace(/\D/g, ""))) return m;
    removed.add("aadhaar");
    return REDACTION_LABELS.aadhaar;
  });

  return { text, removed: [...removed] };
}
