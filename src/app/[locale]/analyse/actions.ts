"use server";

import { getLocale } from "next-intl/server";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { enrichAnalysis, regexIdentifiers, type FoundIdentifier } from "@/lib/ai/enrich";
import { analyseScam, getProvider, isAiConfigured } from "@/lib/ai/provider";
import { AiError, scamAnalysisSchema, type AnalyseInput, type ScamAnalysis } from "@/lib/ai/schema";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/dal";
import { redactForAI, type PiiKind } from "@/lib/redact/pii";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANALYSE_IMAGE_MAX_BYTES, analyseInputSchema } from "@/lib/validation/analyse";

export type AnalyseResult = {
  analysis: ScamAnalysis;
  /** True when Kavach raised the risk because an identifier is publicly reported. */
  riskRaised: boolean;
  identifiers: FoundIdentifier[];
  /** Exactly what was sent to the AI (text input only), for transparency. */
  sentText: string | null;
  removed: PiiKind[];
  cached: boolean;
};

const CACHE_DAYS = 7;
const PROMPT_VERSION = "v1"; // bump when the prompt changes so old cached results aren't reused

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sniffImage(bytes: Uint8Array, mime: string): boolean {
  const b = bytes;
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mime === "image/webp")
    return (
      String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...b.slice(8, 12)) === "WEBP"
    );
  return false;
}

export async function analyseMessage(input: unknown): Promise<ActionResult<AnalyseResult>> {
  const parsed = analyseInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");
  if (!isAiConfigured()) return fail("aiNotConfigured");

  // Phase 5: verify Turnstile token + Upstash per-user/IP rate limit here.

  const locale = (await getLocale()) === "hi" ? "hi" : "en";
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);
  const model = getProvider().model;

  let aiInput: AnalyseInput;
  let sentText: string | null = null;
  let removed: PiiKind[] = [];
  let hash: string;

  if (parsed.data.kind === "text") {
    const redacted = redactForAI(parsed.data.text, { name: profile?.name, email: user?.email });
    sentText = redacted.text;
    removed = redacted.removed;
    aiInput = { kind: "text", text: sentText, locale };
    hash = await sha256Hex(`${PROMPT_VERSION}|${model}|${locale}|text|${sentText}`);
  } else {
    const bytes = new Uint8Array(Buffer.from(parsed.data.dataBase64, "base64"));
    if (
      bytes.length === 0 ||
      bytes.length > ANALYSE_IMAGE_MAX_BYTES ||
      !sniffImage(bytes, parsed.data.mimeType)
    ) {
      return fail("invalidImage");
    }
    aiInput = { kind: "image", data: bytes, mimeType: parsed.data.mimeType, locale };
    // Typed-array copy (not a JS array spread): images can be ~1.5 MB.
    const prefix = new TextEncoder().encode(`${PROMPT_VERSION}|${model}|${locale}|image|`);
    const keyed = new Uint8Array(prefix.length + bytes.length);
    keyed.set(prefix, 0);
    keyed.set(bytes, prefix.length);
    hash = await sha256Hex(keyed);
  }

  const admin = createAdminClient();
  let analysis: ScamAnalysis | null = null;
  let cached = false;

  // Identical (redacted) input analysed recently: reuse it, sparing the free quota.
  try {
    const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
    const { data } = await admin
      .from("ai_analyses")
      .select("result_json")
      .eq("input_hash", hash)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const hit = data ? scamAnalysisSchema.safeParse(data.result_json) : null;
    if (hit?.success) {
      analysis = hit.data;
      cached = true;
    }
  } catch {
    // Cache is best-effort.
  }

  if (!analysis) {
    try {
      const res = await analyseScam(aiInput);
      analysis = res.analysis;
      // Only the hash of the input and the result are stored, never the message.
      await admin
        .from("ai_analyses")
        .insert({
          user_id: user?.id ?? null,
          input_hash: hash,
          input_kind: aiInput.kind,
          model: `${res.provider}:${res.model}`,
          result_json: analysis,
        })
        .then(({ error }) => error && console.error("ai_analyses insert failed", error.code));
    } catch (e) {
      const code = e instanceof AiError ? e.code : "aiUnavailable";
      console.error("analyseScam failed", e instanceof Error ? e.message : code);
      return fail(code);
    }
  }

  const enriched = await enrichAnalysis(analysis, sentText ? regexIdentifiers(sentText) : []);
  return ok({
    analysis: enriched.analysis,
    riskRaised: enriched.riskRaised,
    identifiers: enriched.identifiers,
    sentText,
    removed,
    cached,
  });
}
