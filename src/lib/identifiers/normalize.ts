import { getDomain, parse as parseHost } from "tldts";
import type { Database } from "@/lib/supabase/database.types";
import { SHARED_DOMAINS } from "./shared-domains";

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
// URL -> canonical URL + registrable domain
// ---------------------------------------------------------------------------
export type NormalizedUrl = {
  /** https://host/path — scheme forced to https, no www., query/fragment dropped. */
  url: string;
  /** Hostname without www. (punycode for internationalised names). */
  host: string;
  /** Registrable domain, or null for shared platforms (see SHARED_DOMAINS). */
  domain: string | null;
  /** Host contains punycode: possible look-alike characters (e.g. Cyrillic "ѕbi"). */
  hasLookalikeChars: boolean;
};

const DOMAIN_RE = /^([a-z0-9-]{1,63}\.)+[a-z0-9-]{2,63}$/;

export type UrlParseError = "invalid" | "ip_address" | "unsupported_scheme";

export function normalizeUrl(
  raw: string,
): { ok: true; value: NormalizedUrl } | { ok: false; error: UrlParseError } {
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
  if (parseHost(host).isIp || host.startsWith("[")) return { ok: false, error: "ip_address" };
  host = host.replace(/^www\d?\./, "");
  if (!DOMAIN_RE.test(host)) return { ok: false, error: "invalid" };

  // Paths are case-sensitive (shortener codes!), so keep case; trim trailing slashes.
  const path = u.pathname.replace(/\/+$/, "");
  const url = `https://${host}${path}`;
  if (url.length > MAX_INPUT_LENGTH) return { ok: false, error: "invalid" };

  const registrable = getDomain(host, { allowPrivateDomains: true }) ?? host;
  const shared = SHARED_DOMAINS.has(registrable) || SHARED_DOMAINS.has(host);

  return {
    ok: true,
    value: {
      url,
      host,
      domain: shared ? null : registrable,
      hasLookalikeChars: host.split(".").some((label) => label.startsWith("xn--")),
    },
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
// Free-text input from the /check search box: detect what it is.
// ---------------------------------------------------------------------------
export type DetectedKind = "phone" | "upi" | "email" | "url" | "whatsapp" | "telegram";

export type DetectResult =
  | {
      ok: true;
      kind: DetectedKind;
      /** Human-friendly form of the main value. */
      display: string;
      /** Identifiers to look up, most specific first. */
      lookups: NormalizedIdentifier[];
      url?: NormalizedUrl;
    }
  | { ok: false; error: "empty" | "too_long" | "unrecognized" | UrlParseError };

function fromMessagingLink(u: NormalizedUrl, raw: string): DetectResult | null {
  const { host } = u;
  // wa.me/919876543210 or api.whatsapp.com/send?phone=919876543210
  if (host === "wa.me" || host.endsWith("whatsapp.com")) {
    let digits: string | null = null;
    const path = new URL(u.url).pathname.slice(1);
    if (host === "wa.me" && /^\d{8,15}$/.test(path)) digits = path;
    else {
      try {
        const withScheme = /^[a-z]+:/i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
        digits = new URL(withScheme).searchParams.get("phone");
      } catch {
        digits = null;
      }
    }
    const phone = digits ? normalizePhone(`+${digits.replace(/\D/g, "")}`) : null;
    if (phone) {
      return {
        ok: true,
        kind: "whatsapp",
        display: formatPhone(phone),
        lookups: [{ type: "phone", value: phone }],
        url: u,
      };
    }
  }
  // t.me/handle (but not t.me/+invite or t.me/joinchat/...)
  if (host === "t.me" || host === "telegram.me" || host === "telegram.dog") {
    const handle = new URL(u.url).pathname.split("/")[1] ?? "";
    const social = /^[a-z0-9_]{4,64}$/i.test(handle) ? normalizeSocial("telegram", handle) : null;
    if (social && handle.toLowerCase() !== "joinchat") {
      return {
        ok: true,
        kind: "telegram",
        display: `@${handle}`,
        lookups: [
          { type: "social", value: social },
          { type: "url", value: u.url },
        ],
        url: u,
      };
    }
  }
  return null;
}

export function detectIdentifier(raw: string): DetectResult {
  const s = raw.trim();
  if (!s) return { ok: false, error: "empty" };
  if (s.length > MAX_INPUT_LENGTH) return { ok: false, error: "too_long" };

  // UPI payment link / QR payload
  if (/^upi:/i.test(s)) {
    const upi = normalizeUpi(s);
    return upi
      ? { ok: true, kind: "upi", display: upi, lookups: [{ type: "upi", value: upi }] }
      : { ok: false, error: "unrecognized" };
  }

  // Something with an @ and no URL structure: email (dot in host) or UPI (no dot)
  if (/^[^\s/@]+@[^\s/@]+$/.test(s) || /^mailto:/i.test(s)) {
    const host = s.split("@")[1] ?? "";
    if (host.includes(".")) {
      const email = normalizeEmail(s);
      return email
        ? { ok: true, kind: "email", display: email, lookups: [{ type: "email", value: email }] }
        : { ok: false, error: "unrecognized" };
    }
    const upi = normalizeUpi(s);
    return upi
      ? { ok: true, kind: "upi", display: upi, lookups: [{ type: "upi", value: upi }] }
      : { ok: false, error: "unrecognized" };
  }

  // Looks like a phone number
  if (/^[+\d][\d\s\-(). ]{6,20}$/.test(s)) {
    const phone = normalizePhone(s);
    if (phone) {
      return {
        ok: true,
        kind: "phone",
        display: formatPhone(phone),
        lookups: [{ type: "phone", value: phone }],
      };
    }
    // Not a valid phone: fall through (it may be an IP address or domain).
  }

  // Link or bare domain
  if (!/\s/.test(s) && (s.includes(".") || /^https?:/i.test(s))) {
    const parsed = normalizeUrl(s);
    if (!parsed.ok) return parsed;
    const u = parsed.value;
    const messaging = fromMessagingLink(u, s);
    if (messaging) return messaging;
    const lookups: NormalizedIdentifier[] = [{ type: "url", value: u.url }];
    if (u.domain) lookups.push({ type: "domain", value: u.domain });
    return { ok: true, kind: "url", display: u.host, lookups, url: u };
  }

  return { ok: false, error: "unrecognized" };
}
