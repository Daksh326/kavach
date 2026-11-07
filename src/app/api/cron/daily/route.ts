import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { runDailyJob } from "@/lib/jobs/daily";

/** Constant-time string comparison (avoids leaking the secret via timing). */
function safeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Daily maintenance, invoked by the Cron Trigger in custom-worker.ts. See src/lib/jobs/daily.ts. */
export async function POST(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runDailyJob();
  if (result.errors.length) console.error("daily job errors", result.errors);
  return NextResponse.json(
    { ok: result.errors.length === 0, ...result },
    { status: result.errors.length ? 500 : 200 },
  );
}
