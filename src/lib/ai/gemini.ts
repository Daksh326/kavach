import "server-only";
import { IMAGE_PROMPT, responseSchema, systemInstruction, userContent } from "./prompt";
import { AiError, scamAnalysisSchema, type AnalyseInput, type ScamAnalysis } from "./schema";
import type { ScamAnalysisProvider } from "./provider";

const DEFAULT_BASE = "https://generativelanguage.googleapis.com";
/** Google's alias for the newest Flash model; pin GEMINI_MODEL to freeze it. */
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
const TIMEOUT_MS = 25_000;

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; status?: string; message?: string };
};

/**
 * Google Gemini over plain REST (no SDK: one fetch, nothing added to the
 * Worker bundle). Structured output: the model must return JSON matching
 * responseSchema, which we then validate again with Zod.
 */
export class GeminiProvider implements ScamAnalysisProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    readonly model: string = DEFAULT_GEMINI_MODEL,
    private readonly base: string = DEFAULT_BASE,
  ) {}

  async analyse(input: AnalyseInput): Promise<ScamAnalysis> {
    const parts =
      input.kind === "text"
        ? [{ text: userContent(input.text) }]
        : [
            {
              inlineData: {
                mimeType: input.mimeType,
                data: Buffer.from(input.data).toString("base64"),
              },
            },
            { text: IMAGE_PROMPT },
          ];

    const body = {
      systemInstruction: { parts: [{ text: systemInstruction(input.locale) }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema,
      },
    };

    return this.parse(await this.post(body));
  }

  /** One retry for network errors and 5xx; timeouts are not retried (they'd double a distressed user's wait). */
  private async post(body: unknown): Promise<Response> {
    const url = `${this.base.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status >= 500 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        return res;
      } catch (e) {
        if (e instanceof Error && e.name === "TimeoutError")
          throw new AiError("aiUnavailable", "timeout");
        if (attempt === 0) continue;
        throw new AiError("aiUnavailable", "network");
      }
    }
  }

  private async parse(res: Response): Promise<ScamAnalysis> {
    if (res.status === 429) throw new AiError("aiBusy", "rate limited");
    if (res.status === 401 || res.status === 403)
      throw new AiError("aiNotConfigured", `auth ${res.status}`);
    if (!res.ok) throw new AiError("aiUnavailable", `http ${res.status}`);

    const json = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (json.promptFeedback?.blockReason)
      throw new AiError("aiBlocked", json.promptFeedback.blockReason);
    const candidate = json.candidates?.[0];
    if (!candidate) throw new AiError("aiBadResponse", "no candidate");
    if (candidate.finishReason && !["STOP", "MAX_TOKENS"].includes(candidate.finishReason)) {
      throw new AiError(
        candidate.finishReason === "SAFETY" ? "aiBlocked" : "aiBadResponse",
        candidate.finishReason,
      );
    }
    const text = candidate.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return parseAnalysisJson(text);
  }
}

/** Parse + validate model output (tolerates code fences some models add). */
export function parseAnalysisJson(text: string): ScamAnalysis {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new AiError("aiBadResponse", "invalid json");
  }
  const parsed = scamAnalysisSchema.safeParse(data);
  if (!parsed.success) throw new AiError("aiBadResponse", "schema mismatch");
  return parsed.data;
}
