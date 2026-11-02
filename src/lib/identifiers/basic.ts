/**
 * Identifier normalisers that DON'T need the public-suffix list (tldts), so
 * they are cheap enough for the browser bundle (wizard validation/preview).
 * The full module (normalize.ts) adds registrable-domain logic on top.
 */
import type { Database } from "@/lib/supabase/database.types";

export type IdentifierType = Database["public"]["Enums"]["identifier_type"];

/** A value exactly as stored in identifiers.value_normalized for its type. */
export type NormalizedIdentifier = { type: IdentifierType; value: string };

export const MAX_INPUT_LENGTH = 512;

// ---------------------------------------------------------------------------
// Phone -> E.164. Indian numbers get +91; other countries must be typed with +.
// ---------------------------------------------------------------------------
const PHONE_SEPARATORS = /[\s\-(). ]/g;

export function normalizePhone(raw: string): string | null {
  let s = raw.trim().replace(PHONE_SEPARATORS, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;

  if (s.startsWith("+")) {
    if (s.startsWith("+91")) {
      const rest = s.slice(3).replace(/^0/, "");
      return /^[1-9]\d{9}$/.test(rest) ? `+91${rest}` : null;
    }
    return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
  }

  if (!/^\d+$/.test(s)) return null;
  // 91XXXXXXXXXX (country code without +)
  if (/^91[6-9]\d{9}$/.test(s)) return `+${s}`;
  // 0XXXXXXXXXX (trunk prefix): mobiles and landlines with STD code
  if (/^0[1-9]\d{9}$/.test(s)) return `+91${s.slice(1)}`;
  // XXXXXXXXXX: 10-digit mobile or landline-with-STD
  if (/^[1-9]\d{9}$/.test(s)) return `+91${s}`;
  return null;
}

/** "+919876543210" -> "+91 98765 43210" for display. */
export function formatPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

// ---------------------------------------------------------------------------
// UPI VPA (virtual payment address): handle@psp, no dot in the PSP part.
// ---------------------------------------------------------------------------
const UPI_RE = /^[a-z0-9._-]{2,64}@[a-z0-9.-]{2,64}$/;

export function normalizeUpi(raw: string): string | null {
  let s = raw.trim();
  // A pasted UPI payment link / QR payload: upi://pay?pa=name@psp&pn=...
  if (/^upi:/i.test(s)) {
    try {
      s = new URL(s).searchParams.get("pa") ?? "";
    } catch {
      return null;
    }
  }
  s = s.toLowerCase();
  return UPI_RE.test(s) ? s : null;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z0-9-]{2,}$/;

export function normalizeEmail(raw: string): string | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, "");
  if (s.length > 254 || !EMAIL_RE.test(s)) return null;
  const [, host] = s.split("@");
  return host.split(".").every((l) => l.length > 0 && l.length <= 63) ? s : null;
}

// ---------------------------------------------------------------------------
// URL -> canonical URL (no registrable-domain logic here)
// ---------------------------------------------------------------------------
export type CanonicalUrl = {
  /** https://host/path — scheme forced to https, no www., query/fragment dropped. */
  url: string;
  /** Hostname without www. (punycode for internationalised names). */
  host: string;
  /** Host contains punycode: possible look-alike characters (e.g. Cyrillic "ѕbi"). */
  hasLookalikeChars: boolean;
};

const DOMAIN_RE = /^([a-z0-9-]{1,63}\.)+[a-z0-9-]{2,63}$/;
// WHATWG URL already turns odd IPv4 forms (0x7f.1, 2130706433) into dotted quads.
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export type UrlParseError = "invalid" | "ip_address" | "unsupported_scheme";

export function canonicalizeUrl(
  raw: string,
): { ok: true; value: CanonicalUrl } | { ok: false; error: UrlParseError } {
  let s = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "unsupported_scheme" };
  }

  // WHATWG URL already lower-cases and punycodes the hostname.
  let host = u.hostname.replace(/\.$/, "");
  if (IPV4_RE.test(host) || host.startsWith("[")) return { ok: false, error: "ip_address" };
  host = host.replace(/^www\d?\./, "");
  if (!DOMAIN_RE.test(host)) return { ok: false, error: "invalid" };

  // Paths are case-sensitive (shortener codes!), so keep case; trim trailing slashes.
  const path = u.pathname.replace(/\/+$/, "");
  const url = `https://${host}${path}`;
  if (url.length > MAX_INPUT_LENGTH) return { ok: false, error: "invalid" };

  return {
    ok: true,
    value: { url, host, hasLookalikeChars: host.split(".").some((l) => l.startsWith("xn--")) },
  };
}

// ---------------------------------------------------------------------------
// Social handles: "platform:@handle"
// ---------------------------------------------------------------------------
export function normalizeSocial(platform: string, handle: string): string | null {
  const p = platform.trim().toLowerCase();
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z]{2,20}$/.test(p) || !/^[a-z0-9._-]{2,64}$/.test(h)) return null;
  return `${p}:@${h}`;
}

// ---------------------------------------------------------------------------
// Bank IFSC
// ---------------------------------------------------------------------------
export function normalizeIfsc(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/\s/g, "");
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(s) ? s : null;
}

// ---------------------------------------------------------------------------
// Identifier entered in the report wizard (type chosen by the user).
// ---------------------------------------------------------------------------
export const REPORT_IDENTIFIER_TYPES = [
  "phone",
  "upi",
  "url",
  "email",
  "social",
  "bank_ifsc",
] as const;
export type ReportIdentifierType = (typeof REPORT_IDENTIFIER_TYPES)[number];

export const SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "telegram",
  "x",
  "youtube",
  "linkedin",
  "snapchat",
  "sharechat",
  "other",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/**
 * Normalises one wizard identifier to its PRIMARY stored value (URLs: the
 * canonical URL only). Used for validation and previews in the browser. The
 * server uses normalizeReportIdentifier() (normalize.ts), which also records
 * the registrable domain.
 */
export function normalizeReportIdentifierPrimary(input: {
  type: ReportIdentifierType;
  value: string;
  platform?: string;
}): NormalizedIdentifier[] | null {
  const { type, value } = input;
  switch (type) {
    case "phone": {
      const v = normalizePhone(value);
      return v ? [{ type: "phone", value: v }] : null;
    }
    case "upi": {
      const v = normalizeUpi(value);
      return v ? [{ type: "upi", value: v }] : null;
    }
    case "email": {
      const v = normalizeEmail(value);
      return v ? [{ type: "email", value: v }] : null;
    }
    case "bank_ifsc": {
      const v = normalizeIfsc(value);
      return v ? [{ type: "bank_ifsc", value: v }] : null;
    }
    case "social": {
      const v = normalizeSocial(input.platform ?? "", value);
      return v ? [{ type: "social", value: v }] : null;
    }
    case "url": {
      const r = canonicalizeUrl(value);
      return r.ok ? [{ type: "url", value: r.value.url }] : null;
    }
  }
}

/** Display form of a stored identifier value. */
export function displayIdentifier(type: IdentifierType, value: string): string {
  if (type === "phone") return formatPhone(value);
  if (type === "social") return value.replace(":", " ");
  return value;
}
