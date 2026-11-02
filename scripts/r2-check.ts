/**
 * End-to-end check of the evidence storage configuration (R2 or any
 * S3-compatible endpoint). Uses the app's real storage module.
 *
 *   pnpm storage:check
 *
 * Reads R2_* variables from .env.local. Uploads a tiny test file with the
 * same presigned + checksum flow the app uses, verifies a tampered upload is
 * rejected, downloads it, then deletes it.
 * Set R2_CHECK_CREATE_BUCKET=1 to create the bucket first (emulators only).
 */
import { createHash, randomUUID } from "node:crypto";
import { AwsClient } from "aws4fetch";
import { deleteObject, headObject, presignDownload, presignUpload } from "@/lib/storage/r2";
import { hexToBase64 } from "@/lib/evidence/rules";

const results: [boolean, string, string][] = [];
const check = (name: string, pass: boolean, extra = "") => results.push([pass, name, extra]);

async function main() {
  if (process.env.R2_CHECK_CREATE_BUCKET === "1") {
    const admin = new AwsClient({
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      service: "s3",
      region: process.env.R2_REGION ?? "auto",
    });
    await admin.fetch(`${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET}`, { method: "PUT" });
  }

  const body = Buffer.from(`kavach storage check ${new Date().toISOString()}`);
  const md5 = createHash("md5").update(body).digest("hex");
  const key = `healthcheck/${randomUUID()}`;
  const { url, headers } = await presignUpload({
    key,
    contentType: "text/plain",
    md5Base64: hexToBase64(md5),
  });

  const tampered = await fetch(url, { method: "PUT", headers, body: Buffer.from("tampered") });
  check(
    "upload with a different file is rejected (Content-MD5 enforced)",
    !tampered.ok,
    `HTTP ${tampered.status}`,
  );

  const noChecksum = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body,
  });
  check(
    "upload without the signed Content-MD5 header is rejected",
    !noChecksum.ok,
    `HTTP ${noChecksum.status}`,
  );

  const put = await fetch(url, { method: "PUT", headers, body });
  check(
    "upload via presigned URL succeeds",
    put.ok,
    `HTTP ${put.status} ${put.ok ? "" : await put.text()}`,
  );

  const head = await headObject(key);
  check("stored size matches", head?.size === body.length, JSON.stringify(head));

  const dl = await fetch(
    await presignDownload({ key, fileName: "check.txt", contentType: "text/plain" }),
  );
  const got = Buffer.from(await dl.arrayBuffer());
  check(
    "presigned download returns the same bytes",
    dl.ok && got.equals(body),
    `HTTP ${dl.status}`,
  );
  check(
    "download is served as an attachment",
    (dl.headers.get("content-disposition") ?? "").startsWith("attachment"),
  );

  check("delete succeeds", await deleteObject(key));
  check("object is gone after delete", (await headObject(key)) === null);
}

main()
  .catch((e) => check("storage reachable", false, e instanceof Error ? e.message : String(e)))
  .finally(() => {
    for (const [pass, name, extra] of results)
      console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${extra}`);
    process.exit(results.every(([p]) => p) ? 0 : 1);
  });
