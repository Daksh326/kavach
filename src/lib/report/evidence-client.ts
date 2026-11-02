"use client";

import { confirmEvidenceUpload, createEvidenceUpload } from "@/app/[locale]/report/actions";
import {
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_FILES,
  hashFile,
  isAllowedMime,
} from "@/lib/evidence/rules";
import type { DraftFile } from "./draft-store";

export { formatBytes } from "@/lib/evidence/rules";

export type PrepareIssue = { kind: "tooBig" | "badType" | "tooMany"; name: string };

/** Validates and hashes picked files (SHA-256 + MD5), in the browser. */
export async function prepareFiles(
  files: File[],
  existingCount: number,
  onProgress?: (name: string) => void,
): Promise<{ ready: DraftFile[]; issues: PrepareIssue[] }> {
  const ready: DraftFile[] = [];
  const issues: PrepareIssue[] = [];
  for (const file of files) {
    if (existingCount + ready.length >= EVIDENCE_MAX_FILES) {
      issues.push({ kind: "tooMany", name: file.name });
      break;
    }
    if (!isAllowedMime(file.type)) {
      issues.push({ kind: "badType", name: file.name });
      continue;
    }
    if (file.size === 0 || file.size > EVIDENCE_MAX_BYTES) {
      issues.push({ kind: "tooBig", name: file.name });
      continue;
    }
    onProgress?.(file.name);
    const { sha256, md5 } = await hashFile(file);
    ready.push({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type,
      size: file.size,
      sha256,
      md5,
      blob: file,
    });
  }
  return { ready, issues };
}

/**
 * Upload = ask server for a presigned URL (+ HMAC ticket) -> PUT the bytes
 * straight to R2 -> server confirms the object and records the evidence row.
 * Returns "ok" or an i18n error key under report.errors.
 */
export async function uploadEvidence(reportId: string, f: DraftFile): Promise<string> {
  const req = await createEvidenceUpload({
    reportId,
    fileName: f.name,
    mimeType: f.type,
    sizeBytes: f.size,
    sha256: f.sha256,
    md5: f.md5,
  });
  if (!req.ok) return req.error;

  const put = await fetch(req.data.url, {
    method: "PUT",
    headers: req.data.headers,
    body: f.blob,
  }).catch(() => null);
  if (!put?.ok) return "uploadFailed";

  const confirmed = await confirmEvidenceUpload({ ticket: req.data.ticket, fileName: f.name });
  return confirmed.ok ? "ok" : confirmed.error;
}
