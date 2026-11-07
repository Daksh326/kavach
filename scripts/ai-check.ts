/**
 * Checks the real AI configuration (GEMINI_API_KEY / GEMINI_MODEL in .env.local)
 * using the app's own provider code.
 *
 *   pnpm ai:check
 *
 * Sends one fake scam SMS (English, then Hindi), validates the structured
 * result, and if the model id is wrong, lists the Flash models your key can use.
 */
import { analyseScam, getProvider } from "@/lib/ai/provider";
import { AiError } from "@/lib/ai/schema";
import { redactForAI } from "@/lib/redact/pii";

const SAMPLE =
  "Dear Rahul, your SBI YONO account will be blocked today. Update PAN at http://sbi-yono-kyc.example.top/login or call 9876543210 immediately. -SBI";

async function listFlashModels() {
  const key = process.env.GEMINI_API_KEY!;
  const base = process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com";
  const res = await fetch(`${base}/v1beta/models?pageSize=200`, {
    headers: { "x-goog-api-key": key },
  });
  if (!res.ok) return console.log(`  (could not list models: HTTP ${res.status})`);
  const data = (await res.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
  };
  const names = (data.models ?? [])
    .filter(
      (m) => m.name.includes("flash") && m.supportedGenerationMethods?.includes("generateContent"),
    )
    .map((m) => m.name.replace("models/", ""));
  console.log("  Flash models your key can use (set one as GEMINI_MODEL):");
  for (const n of names) console.log(`   - ${n}`);
}

async function main() {
  let failed = false;
  let provider;
  try {
    provider = getProvider();
  } catch {
    console.log("FAIL  GEMINI_API_KEY is not set in .env.local");
    process.exit(1);
  }
  console.log(`Provider: ${provider.name}, model: ${provider.model}\n`);

  for (const locale of ["en", "hi"] as const) {
    const started = Date.now();
    try {
      const { analysis } = await analyseScam({
        kind: "text",
        text: redactForAI(SAMPLE).text,
        locale,
      });
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const sensible = analysis.risk !== "low" && analysis.extracted_identifiers.length > 0;
      console.log(`${sensible ? "PASS" : "WARN"}  ${locale}: valid structured result in ${secs}s`);
      console.log(`      risk=${analysis.risk} scam_type=${analysis.scam_type}`);
      console.log(
        `      identifiers=${analysis.extracted_identifiers.map((i) => `${i.type}:${i.value}`).join(", ")}`,
      );
      console.log(`      red_flags[0]=${analysis.red_flags[0] ?? "(none)"}`);
      console.log(`      advice=${analysis.advice.slice(0, 120)}\n`);
    } catch (e) {
      failed = true;
      const code = e instanceof AiError ? e.message : String(e);
      console.log(`FAIL  ${locale}: ${code}`);
      if (code.includes("http 404") || code.includes("http 400")) await listFlashModels();
      if (code.includes("aiNotConfigured"))
        console.log("  The API key was rejected. Create one at aistudio.google.com/apikey");
      if (code.includes("aiBusy"))
        console.log("  Rate limited (free tier). Wait a minute and retry.");
      console.log();
    }
  }
  process.exit(failed ? 1 : 0);
}

void main();
