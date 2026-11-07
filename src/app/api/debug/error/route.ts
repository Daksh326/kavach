import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";

/**
 * Deliberately throws, to confirm server errors reach Sentry (README:
 * "Verify monitoring"). Protected by CRON_SECRET; 404 for everyone else.
 */
export async function POST(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  throw new Error("Kavach monitoring test error (expected)");
}
