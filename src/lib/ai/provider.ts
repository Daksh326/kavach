import "server-only";
import { serverEnv } from "@/lib/env/server";
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from "./gemini";
import { AiError, type AnalyseInput, type ScamAnalysis } from "./schema";

/**
 * The single seam between Kavach and any AI model. To switch to a paid tier
 * or another vendor, add a class implementing this interface and return it
 * from getProvider(); nothing else in the app changes.
 */
export interface ScamAnalysisProvider {
  readonly name: string;
  readonly model: string;
  analyse(input: AnalyseInput): Promise<ScamAnalysis>;
}

export function getProvider(): ScamAnalysisProvider {
  const env = serverEnv();
  if (!env.GEMINI_API_KEY) throw new AiError("aiNotConfigured", "GEMINI_API_KEY missing");
  return new GeminiProvider(
    env.GEMINI_API_KEY,
    env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
    env.GEMINI_API_BASE,
  );
}

export function isAiConfigured(): boolean {
  return Boolean(serverEnv().GEMINI_API_KEY);
}

/** Analyse a (redacted) message or an explicitly-shared screenshot. */
export async function analyseScam(
  input: AnalyseInput,
): Promise<{ analysis: ScamAnalysis; provider: string; model: string }> {
  const provider = getProvider();
  try {
    const analysis = await provider.analyse(input);
    return { analysis, provider: provider.name, model: provider.model };
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError("aiUnavailable", e instanceof Error ? e.name : "unknown");
  }
}
