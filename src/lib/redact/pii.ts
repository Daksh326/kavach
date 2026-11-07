import { stripSensitive, type SensitiveKind } from "./sensitive";

/**
 * Redaction applied to text BEFORE it is sent to an AI service (the Gemini
 * free tier may use submissions to improve Google's products).
 *
 * Removes the user's own data and anything secret, while KEEPING what the
 * analysis needs: the scammer's numbers, UPI IDs, links and wording.
 */
export type PiiKind =
  SensitiveKind | "pan" | "long_number" | "own_name" | "own_email" | "own_phone" | "greeting_name";

export type RedactContext = {
  /** The signed-in user's own details, if known. */
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export const PII_LABELS: Record<Exclude<PiiKind, SensitiveKind>, string> = {
  pan: "[PAN removed]",
  long_number: "[number removed]",
  own_name: "[name]",
  own_email: "[your email]",
  own_phone: "[your number]",
  greeting_name: "[name]",
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Generic salutations that are not names ("Dear Customer", "प्रिय ग्राहक").
const GENERIC_GREETING = new Set([
  "customer",
  "customers",
  "user",
  "users",
  "sir",
  "madam",
  "sir/madam",
  "member",
  "members",
  "valued",
  "friend",
  "friends",
  "all",
  "team",
  "client",
  "applicant",
  "candidate",
  "account",
  "holder",
  "beneficiary",
  "subscriber",
  "consumer",
  "card",
  "cardholder",
  "parent",
  "student",
  "investor",
  "winner",
  "lucky",
  "ग्राहक",
  "उपभोक्ता",
  "महोदय",
  "महोदया",
  "सदस्य",
  "मित्र",
  "दोस्त",
  "आवेदक",
  "विजेता",
  "निवेशक",
]);

export function redactForAI(
  input: string,
  ctx: RedactContext = {},
): { text: string; removed: PiiKind[] } {
  const removed = new Set<PiiKind>();
  const base = stripSensitive(input);
  base.removed.forEach((k) => removed.add(k));
  let text = base.text;

  // PAN: AAAAA9999A (4th letter = holder type).
  text = text.replace(/\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b/gi, () => {
    removed.add("pan");
    return PII_LABELS.pan;
  });

  // Bare 11-18 digit runs look like account / customer IDs. Phone forms
  // (0/91 + 10-digit mobile) are kept: the scammer's number is needed.
  text = text.replace(/(?<![\d+])\d{11,18}(?!\d)/g, (m) => {
    if (/^(?:0|91)[6-9]\d{9}$/.test(m)) return m;
    removed.add("long_number");
    return PII_LABELS.long_number;
  });

  if (ctx.email) {
    const re = new RegExp(escapeRe(ctx.email.trim()), "gi");
    text = text.replace(re, () => {
      removed.add("own_email");
      return PII_LABELS.own_email;
    });
  }

  if (ctx.phone) {
    const digits = ctx.phone.replace(/\D/g, "").slice(-10);
    if (digits.length === 10) {
      // Matches the last 10 digits with optional +91/0 prefix and separators.
      const sep = String.raw`[\s\-().]?`;
      const re = new RegExp(
        String.raw`(?:\+?91${sep}|0)?` + digits.split("").join(sep) + String.raw`(?!\d)`,
        "g",
      );
      text = text.replace(re, () => {
        removed.add("own_phone");
        return PII_LABELS.own_phone;
      });
    }
  }

  if (ctx.name) {
    const full = ctx.name.trim().replace(/\s+/g, " ");
    const parts = [full, ...full.split(" ")].filter((p) => p.length >= 3);
    for (const part of [...new Set(parts)].sort((a, b) => b.length - a.length)) {
      const re = new RegExp(String.raw`(?<![\p{L}\p{M}])${escapeRe(part)}(?![\p{L}\p{M}])`, "giu");
      text = text.replace(re, () => {
        removed.add("own_name");
        return PII_LABELS.own_name;
      });
    }
  }

  // Names in greetings: "Dear Rahul Sharma," / "Hi Mr. Kumar" / "प्रिय राहुल जी".
  text = text.replace(
    /\b(Dear|Hi|Hello|Hey|Respected)(\s+(?:Mr|Mrs|Ms|Miss|Shri|Smt|Dr)\.?)?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g,
    (m, greet: string, title: string | undefined, name: string) => {
      if (GENERIC_GREETING.has(name.split(" ")[0].toLowerCase())) return m;
      removed.add("greeting_name");
      return `${greet}${title ?? ""} ${PII_LABELS.greeting_name}`;
    },
  );
  text = text.replace(
    /(प्रिय|नमस्ते|आदरणीय)(\s+(?:श्री|श्रीमती|सुश्री))?\s+([ऀ-ॿ]+(?:\s+[ऀ-ॿ]+)?)/g,
    (m, greet: string, title: string | undefined, name: string) => {
      const first = name.split(/\s+/)[0];
      if (GENERIC_GREETING.has(first)) return m;
      removed.add("greeting_name");
      // Keep a trailing honorific "जी" if present.
      const ji = /\s+जी$/.test(name) ? " जी" : "";
      return `${greet}${title ?? ""} ${PII_LABELS.greeting_name}${ji}`;
    },
  );

  return { text, removed: [...removed] };
}
