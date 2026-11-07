import "server-only";
import { AwsClient } from "aws4fetch";
import { serverEnv } from "@/lib/env/server";

/**
 * Private evidence bucket on Cloudflare R2, accessed via its S3-compatible
 * API (aws4fetch). Browsers upload/download directly with short-lived
 * presigned URLs, so file bytes never pass through (or cost CPU in) the
 * Worker. The same code works against any S3-compatible endpoint (used for
 * local testing via R2_ENDPOINT).
 */
type StorageConfig = { client: AwsClient; endpoint: string; bucket: string };

let cached: StorageConfig | null | undefined;

function config(): StorageConfig | null {
  if (cached !== undefined) return cached;
  const env = serverEnv();
  const endpoint =
    env.R2_ENDPOINT ??
    (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
  if (!endpoint || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET) {
    cached = null;
    return cached;
  }
  cached = {
    endpoint: endpoint.replace(/\/$/, ""),
    bucket: env.R2_BUCKET,
    client: new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: env.R2_REGION ?? "auto",
    }),
  };
  return cached;
}

export function isStorageConfigured(): boolean {
  return config() !== null;
}

function requireConfig(): StorageConfig {
  const c = config();
  if (!c) throw new Error("Evidence storage (R2) is not configured");
  return c;
}

function objectUrl(c: StorageConfig, key: string): URL {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return new URL(`${c.endpoint}/${c.bucket}/${path}`);
}

export const UPLOAD_URL_TTL_SECONDS = 300;
export const DOWNLOAD_URL_TTL_SECONDS = 300;

/**
 * Presigned PUT. Content-Type and Content-MD5 are SIGNED headers: the
 * browser must send exactly these values, and R2 rejects a body whose MD5
 * differs from Content-MD5 (R2 documents Content-MD5 for PutObject; it does
 * NOT document x-amz-checksum-sha256 for single-part uploads, so we don't
 * rely on it). The user-facing integrity hash is the SHA-256 recorded in the
 * evidence row, bound to this upload by the HMAC ticket.
 */
export async function presignUpload(args: {
  key: string;
  contentType: string;
  md5Base64: string;
}): Promise<{ url: string; headers: Record<string, string> }> {
  const c = requireConfig();
  const url = objectUrl(c, args.key);
  url.searchParams.set("X-Amz-Expires", String(UPLOAD_URL_TTL_SECONDS));
  const headers = {
    "content-type": args.contentType,
    "content-md5": args.md5Base64,
  };
  const signed = await c.client.sign(new Request(url, { method: "PUT", headers }), {
    aws: { signQuery: true, allHeaders: true },
  });
  return { url: signed.url, headers };
}

export async function presignDownload(args: {
  key: string;
  fileName: string;
  contentType: string;
  ttlSeconds?: number;
}): Promise<string> {
  const c = requireConfig();
  const url = objectUrl(c, args.key);
  url.searchParams.set("X-Amz-Expires", String(args.ttlSeconds ?? DOWNLOAD_URL_TTL_SECONDS));
  const ascii = args.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  url.searchParams.set(
    "response-content-disposition",
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(args.fileName)}`,
  );
  url.searchParams.set("response-content-type", args.contentType);
  const signed = await c.client.sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

/** Size and type of a stored object, or null if it doesn't exist. */
export async function headObject(
  key: string,
): Promise<{ size: number; contentType: string } | null> {
  const c = requireConfig();
  const res = await c.client.fetch(objectUrl(c, key), { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD failed: ${res.status}`);
  return {
    size: Number(res.headers.get("content-length") ?? "0"),
    contentType: res.headers.get("content-type") ?? "",
  };
}

/** Deletes an object. Missing objects count as deleted (S3 returns 204). */
export async function deleteObject(key: string): Promise<boolean> {
  const c = requireConfig();
  const res = await c.client.fetch(objectUrl(c, key), { method: "DELETE" });
  return res.ok || res.status === 404;
}

/**
 * Lists objects under a prefix (S3 ListObjectsV2). Returns at most `max`
 * keys with their last-modified time. Parsed with a regex (the XML is flat),
 * keeping Worker CPU low.
 */
export async function listObjects(
  prefix: string,
  max = 1000,
): Promise<{ key: string; lastModified: Date }[]> {
  const c = requireConfig();
  const out: { key: string; lastModified: Date }[] = [];
  let token: string | undefined;
  do {
    const url = new URL(`${c.endpoint}/${c.bucket}`);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("max-keys", String(Math.min(1000, max - out.length)));
    if (token) url.searchParams.set("continuation-token", token);
    const res = await c.client.fetch(url);
    if (!res.ok) throw new Error(`R2 list failed: ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = /<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1];
      const lm = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(m[1])?.[1];
      if (key && lm) out.push({ key: decodeXml(key), lastModified: new Date(lm) });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1]
      : undefined;
  } while (token && out.length < max);
  return out;
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
