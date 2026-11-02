import "server-only";
import { serverEnv } from "@/lib/env/server";

/**
 * HMAC "ticket" binding an upload to the exact key, hash, size and type we
 * presigned. confirmEvidenceUpload() only records evidence whose ticket
 * verifies, so a client can't get a URL for hash A and then record hash B.
 * Key is derived from SUPABASE_SECRET_KEY (server-only) with a fixed label.
 */
export type TicketPayload = {
  key: string;
  reportId: string;
  sha256: string;
  md5: string;
  size: number;
  mime: string;
  exp: number;
};

const enc = new TextEncoder();
let keyPromise: Promise<CryptoKey> | undefined;

function hmacKey(): Promise<CryptoKey> {
  keyPromise ??= (async () => {
    const root = await crypto.subtle.importKey(
      "raw",
      enc.encode(serverEnv().SUPABASE_SECRET_KEY),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const derived = await crypto.subtle.sign("HMAC", root, enc.encode("kavach/evidence-ticket/v1"));
    return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
  })();
  return keyPromise;
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function signTicket(payload: TicketPayload): Promise<string> {
  const body = enc.encode(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), body));
  return `${b64url(body)}.${b64url(sig)}`;
}

export async function verifyTicket(ticket: string): Promise<TicketPayload | null> {
  const [body, sig] = ticket.split(".");
  if (!body || !sig) return null;
  try {
    const bodyBytes = fromB64url(body);
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromB64url(sig), bodyBytes);
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(bodyBytes)) as TicketPayload;
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}
