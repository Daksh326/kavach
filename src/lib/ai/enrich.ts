import "server-only";
import {
  detectIdentifier,
  displayIdentifier,
  normalizeIfsc,
  type IdentifierType,
  type NormalizedIdentifier,
} from "@/lib/identifiers/normalize";
import { lookupIdentifiers } from "@/lib/identifiers/lookup";
import type { ScamAnalysis } from "./schema";

export type FoundIdentifier = {
  /** What the wizard / check page should use. */
  type: IdentifierType;
  value: string;
  display: string;
  isReported: boolean;
  reporterCount: number;
};

const MAX_IDENTIFIERS = 10;

/**
 * Cheap safety net for identifiers the model might miss (text input only):
 * links, UPI IDs and Indian mobile numbers.
 */
export function regexIdentifiers(text: string): string[] {
  const found = [
    ...text.matchAll(/\bhttps?:\/\/[^\s<>"')]+/gi),
    ...text.matchAll(/\b(?:wa\.me|t\.me|bit\.ly)\/[^\s<>"')]+/gi),
    ...text.matchAll(/(?<![\w.@-])[a-z0-9._-]{2,64}@[a-z]{2,32}(?![\w.@-])/gi), // UPI (no dot in handle)
    ...text.matchAll(/(?<![\d+])(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g),
  ].map((m) => m[0].replace(/[.,;:!?]+$/, ""));
  return [...new Set(found)];
}

/**
 * Normalises the AI's identifiers (plus regex finds), looks each up in
 * Kavach's own reports, and raises the risk to "high" if any of them has
 * been publicly reported, whatever the model said.
 */
export async function enrichAnalysis(
  analysis: ScamAnalysis,
  extraRaw: string[],
): Promise<{
  analysis: ScamAnalysis;
  riskRaised: boolean;
  identifiers: FoundIdentifier[];
  lookupFailed: boolean;
}> {
  const candidates = new Map<
    string,
    { main: NormalizedIdentifier; lookups: NormalizedIdentifier[]; display: string }
  >();

  const add = (raw: string, hintType?: string) => {
    if (candidates.size >= MAX_IDENTIFIERS) return;
    if (hintType === "bank_ifsc") {
      const v = normalizeIfsc(raw);
      if (v)
        candidates.set(`bank_ifsc:${v}`, {
          main: { type: "bank_ifsc", value: v },
          lookups: [{ type: "bank_ifsc", value: v }],
          display: v,
        });
      return;
    }
    if (hintType === "social") return; // platform unknown; can't look up reliably
    const d = detectIdentifier(raw);
    if (!d.ok) return;
    const main = d.lookups[0];
    const key = `${main.type}:${main.value}`;
    if (!candidates.has(key))
      candidates.set(key, {
        main,
        lookups: d.lookups,
        display: d.kind === "url" ? d.lookups[0].value : d.display,
      });
  };

  for (const id of analysis.extracted_identifiers) add(id.value, id.type);
  for (const raw of extraRaw) add(raw);

  const entries = [...candidates.values()];
  if (entries.length === 0)
    return { analysis, riskRaised: false, identifiers: [], lookupFailed: false };

  const flat = entries.flatMap((e) => e.lookups);
  const result = await lookupIdentifiers(flat);
  const hits = result.ok ? result.hits : [];

  const identifiers: FoundIdentifier[] = entries.map((e) => {
    const mine = hits.filter((h) =>
      e.lookups.some((l) => l.type === h.type && l.value === h.value),
    );
    const reported = mine.filter((h) => h.isReported);
    return {
      type: e.main.type,
      value: e.main.value,
      display: e.main.type === "phone" ? displayIdentifier("phone", e.main.value) : e.display,
      isReported: reported.length > 0,
      reporterCount: Math.max(0, ...reported.map((h) => h.reporterCount)),
    };
  });

  const anyReported = identifiers.some((i) => i.isReported);
  const riskRaised = anyReported && analysis.risk !== "high";
  return {
    analysis: riskRaised
      ? {
          ...analysis,
          risk: "high",
          scam_type: analysis.scam_type === "not_scam" ? "other" : analysis.scam_type,
        }
      : analysis,
    riskRaised,
    identifiers,
    lookupFailed: !result.ok,
  };
}
