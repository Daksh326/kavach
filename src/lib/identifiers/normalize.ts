import { getDomain } from "tldts";
import {
  MAX_INPUT_LENGTH,
  canonicalizeUrl,
  formatPhone,
  normalizeEmail,
  normalizePhone,
  normalizeReportIdentifierPrimary,
  normalizeSocial,
  normalizeUpi,
  type NormalizedIdentifier,
  type ReportIdentifierType,
  type UrlParseError,
} from "./basic";
import { SHARED_DOMAINS } from "./shared-domains";

/**
 * Full identifier normalisation, including registrable-domain logic (tldts +
 * public-suffix list). Server-side and in tests; the browser imports the
 * lighter ./basic module instead.
 */
export * from "./basic";

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

export function normalizeUrl(
  raw: string,
): { ok: true; value: NormalizedUrl } | { ok: false; error: UrlParseError } {
  const r = canonicalizeUrl(raw);
  if (!r.ok) return r;
  const { url, host, hasLookalikeChars } = r.value;
  const registrable = getDomain(host, { allowPrivateDomains: true }) ?? host;
  const shared = SHARED_DOMAINS.has(registrable) || SHARED_DOMAINS.has(host);
  return { ok: true, value: { url, host, domain: shared ? null : registrable, hasLookalikeChars } };
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

// ---------------------------------------------------------------------------
// Report wizard identifiers (server): primary value + registrable domain.
// ---------------------------------------------------------------------------
export function normalizeReportIdentifier(input: {
  type: ReportIdentifierType;
  value: string;
  platform?: string;
}): NormalizedIdentifier[] | null {
  if (input.type !== "url") return normalizeReportIdentifierPrimary(input);
  const r = normalizeUrl(input.value);
  if (!r.ok) return null;
  const out: NormalizedIdentifier[] = [{ type: "url", value: r.value.url }];
  if (r.value.domain) out.push({ type: "domain", value: r.value.domain });
  return out;
}
