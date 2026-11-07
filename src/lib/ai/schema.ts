import { z } from "zod";
import { Constants } from "@/lib/supabase/database.types";

/**
 * The analysis contract every AI provider must return. Validated with Zod
 * on the server, whatever model produced it.
 */
export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Scam categories plus "not_scam" for clearly harmless messages. */
export const AI_SCAM_TYPES = [...Constants.public.Enums.scam_category, "not_scam"] as const;
export type AiScamType = (typeof AI_SCAM_TYPES)[number];

export const AI_IDENTIFIER_TYPES = ["phone", "upi", "url", "email", "bank_ifsc", "social"] as const;

export const scamAnalysisSchema = z.object({
  risk: z.enum(RISK_LEVELS),
  scam_type: z.enum(AI_SCAM_TYPES),
  red_flags: z.array(z.string().trim().min(1).max(300)).max(8),
  extracted_identifiers: z
    .array(
      z.object({
        type: z.enum(AI_IDENTIFIER_TYPES),
        value: z.string().trim().min(1).max(512),
      }),
    )
    .max(15),
  advice: z.string().trim().min(1).max(1200),
});

export type ScamAnalysis = z.infer<typeof scamAnalysisSchema>;

export type AnalyseInput =
  | { kind: "text"; text: string; locale: "en" | "hi" }
  | {
      kind: "image";
      data: Uint8Array;
      mimeType: "image/jpeg" | "image/png" | "image/webp";
      locale: "en" | "hi";
    };

/** Failure modes callers turn into user-facing messages (i18n keys). */
export type AiErrorCode =
  "aiNotConfigured" | "aiBusy" | "aiUnavailable" | "aiBlocked" | "aiBadResponse";

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "AiError";
  }
}
