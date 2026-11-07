"use client";

import type { IdentifierEntry, ReportFormValues } from "@/lib/validation/report";

/**
 * One-shot handoff into the report wizard (e.g. "Report this" on /analyse).
 * sessionStorage, not the URL, so message text never lands in history/logs.
 */
export const REPORT_PREFILL_KEY = "kavach:report-prefill";

export type ReportPrefill = {
  category?: ReportFormValues["category"];
  identifiers?: Pick<IdentifierEntry, "type" | "value">[];
  description?: string;
};

export function writeReportPrefill(p: ReportPrefill) {
  try {
    sessionStorage.setItem(REPORT_PREFILL_KEY, JSON.stringify(p));
  } catch {
    // ignore: the wizard just starts empty
  }
}

export function readReportPrefill(): ReportPrefill | null {
  try {
    const raw = sessionStorage.getItem(REPORT_PREFILL_KEY);
    return raw ? (JSON.parse(raw) as ReportPrefill) : null;
  } catch {
    return null;
  }
}

export function clearReportPrefill() {
  try {
    sessionStorage.removeItem(REPORT_PREFILL_KEY);
  } catch {
    // ignore
  }
}
