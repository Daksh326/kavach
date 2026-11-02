import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";
import type { NormalizedIdentifier } from "./normalize";

type Enums = Database["public"]["Enums"];

export type LookupHit = {
  type: Enums["identifier_type"];
  value: string;
  isReported: boolean;
  reporterCount: number;
  categories: Enums["scam_category"][];
  channels: Enums["report_channel"][];
  firstSeen: string | null;
  lastSeen: string | null;
};

export type SimilarHit = { type: Enums["identifier_type"]; value: string; reporterCount: number };

export type LookupResult =
  { ok: true; hits: LookupHit[]; similar: SimilarHit[] } | { ok: false; error: "unavailable" };

/**
 * Looks up every normalised identifier via the public SECURITY DEFINER RPC.
 * The RPC already applies the 2-distinct-reporter threshold and hides
 * moderated entries; below the threshold it returns is_reported=false with
 * no counts or dates.
 */
export async function lookupIdentifiers(items: NormalizedIdentifier[]): Promise<LookupResult> {
  try {
    const supabase = createPublicClient();
    const responses = await Promise.all(
      items.map((i) => supabase.rpc("lookup_identifier", { p_type: i.type, p_value: i.value })),
    );
    if (responses.some((r) => r.error)) {
      console.error("lookup_identifier failed", responses.find((r) => r.error)?.error?.code);
      return { ok: false, error: "unavailable" };
    }
    const hits: LookupHit[] = responses.map((r, idx) => {
      const row = r.data?.[0];
      return {
        type: items[idx].type,
        value: items[idx].value,
        isReported: row?.is_reported ?? false,
        reporterCount: row?.reporter_count ?? 0,
        categories: row?.categories ?? [],
        channels: row?.channels ?? [],
        firstSeen: row?.first_seen ?? null,
        lastSeen: row?.last_seen ?? null,
      };
    });

    // "Similar reported sites" only for domains (catches typo-squats like
    // sbi-kyc-updates.com vs sbi-kyc-update.com). For phones and UPI IDs a
    // one-character difference is a different person, so fuzzy matches
    // would only mislead.
    let similar: SimilarHit[] = [];
    const domain = items.find((i) => i.type === "domain");
    const domainHit = hits.find((h) => h.type === "domain");
    if (domain && !domainHit?.isReported) {
      const { data, error } = await supabase.rpc("search_identifiers", {
        p_query: domain.value,
        p_type: "domain",
        p_limit: 3,
      });
      if (!error && data) {
        similar = data
          .filter((d) => d.value_normalized !== domain.value)
          .map((d) => ({
            type: d.type,
            value: d.value_normalized,
            reporterCount: d.reporter_count,
          }));
      }
    }
    return { ok: true, hits, similar };
  } catch (e) {
    console.error("lookup failed", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "unavailable" };
  }
}
