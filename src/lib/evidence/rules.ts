/** Shared (client + server) evidence rules. DB constraints mirror these. */
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_MAX_FILES = 10;

export const EVIDENCE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/aac",
  "video/mp4",
  "text/plain",
] as const;

export type EvidenceMimeType = (typeof EVIDENCE_MIME_TYPES)[number];

export const EVIDENCE_ACCEPT = EVIDENCE_MIME_TYPES.join(",");

export function isAllowedMime(type: string): type is EvidenceMimeType {
  return (EVIDENCE_MIME_TYPES as readonly string[]).includes(type);
}

/** Strip any path and control characters from a user-supplied file name. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return (cleaned || "file").slice(0, 200);
}

export function hexToBase64(hex: string): string {
  const bytes = hex.match(/../g)!.map((h) => parseInt(h, 16));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Hashes a file in the browser: SHA-256 (Web Crypto; the integrity hash we
 * store and print) and MD5 (spark-md5; only for R2's Content-MD5 upload
 * check, since Web Crypto has no MD5).
 */
export async function hashFile(file: Blob): Promise<{ sha256: string; md5: string }> {
  const [buf, { default: SparkMD5 }] = await Promise.all([file.arrayBuffer(), import("spark-md5")]);
  const sha256 = toHex(await crypto.subtle.digest("SHA-256", buf));
  const md5 = SparkMD5.ArrayBuffer.hash(buf);
  return { sha256, md5 };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
