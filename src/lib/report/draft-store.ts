"use client";

import type { ReportFormValues } from "@/lib/validation/report";

/**
 * Unsubmitted report drafts live ONLY on this device (consent hasn't been
 * given yet): form values in localStorage, evidence files in IndexedDB
 * (localStorage can't hold binary). Every call tolerates storage being
 * unavailable (private mode, quota): the wizard then just doesn't persist.
 */
const FORM_KEY = "kavach:report-draft:v1";
const DB_NAME = "kavach";
const STORE = "report-draft-files";

export type FormDraft = { values: Partial<ReportFormValues>; step: number; savedAt: string };

export function loadFormDraft(): FormDraft | null {
  try {
    const raw = localStorage.getItem(FORM_KEY);
    return raw ? (JSON.parse(raw) as FormDraft) : null;
  } catch {
    return null;
  }
}

export function saveFormDraft(values: Partial<ReportFormValues>, step: number) {
  try {
    // The consent tick is kept so it survives the sign-in round trip; the
    // recorded consent_at is the moment the report is actually submitted.
    localStorage.setItem(
      FORM_KEY,
      JSON.stringify({ values, step, savedAt: new Date().toISOString() } satisfies FormDraft),
    );
  } catch {
    // ignore
  }
}

export function clearFormDraft() {
  try {
    localStorage.removeItem(FORM_KEY);
  } catch {
    // ignore
  }
}

export type DraftFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  sha256: string;
  md5: string;
  blob: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export async function listDraftFiles(): Promise<DraftFile[]> {
  try {
    return await tx("readonly", (s) => s.getAll() as IDBRequest<DraftFile[]>);
  } catch {
    return [];
  }
}

export async function putDraftFile(file: DraftFile): Promise<void> {
  try {
    await tx("readwrite", (s) => s.put(file));
  } catch {
    // kept in memory by the caller
  }
}

export async function deleteDraftFile(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    // ignore
  }
}

export async function clearDraftFiles(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.clear());
  } catch {
    // ignore
  }
}
