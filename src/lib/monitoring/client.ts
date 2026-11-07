"use client";

import { publicEnv } from "@/lib/env/public";
import { buildEnvelope, buildEvent, parseDsn, sendEnvelope } from "./sentry-core";

const dsn = parseDsn(publicEnv.NEXT_PUBLIC_SENTRY_DSN);
let sent = 0;
const MAX_PER_PAGE = 5;

/** Report a browser error (at most 5 per page load). */
export function captureClientError(error: unknown, tags: Record<string, string> = {}) {
  if (!dsn || sent >= MAX_PER_PAGE) return;
  sent++;
  const event = buildEvent({
    error,
    platform: "javascript",
    environment: process.env.NODE_ENV ?? "production",
    path: window.location.pathname,
    tags: { runtime: "browser", ...tags },
  });
  void sendEnvelope(dsn, buildEnvelope(dsn, event));
}
