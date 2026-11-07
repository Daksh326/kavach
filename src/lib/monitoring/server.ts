import "server-only";
import { serverEnv } from "@/lib/env/server";
import { buildEnvelope, buildEvent, parseDsn, sendEnvelope } from "./sentry-core";

/** Report a server-side error to Sentry without delaying the response. */
export function captureServerError(error: unknown, context: { path?: string; kind?: string } = {}) {
  const dsn = parseDsn(serverEnv().SENTRY_DSN);
  if (!dsn) return;
  const event = buildEvent({
    error,
    platform: "node",
    environment: process.env.NODE_ENV ?? "production",
    path: context.path?.split("?")[0],
    tags: { runtime: "server", ...(context.kind ? { kind: context.kind } : {}) },
  });
  const sending = sendEnvelope(dsn, buildEnvelope(dsn, event));
  // On Workers, keep the isolate alive until the report is sent. Read the
  // request context OpenNext stores on this global symbol, rather than
  // importing @opennextjs/cloudflare here (that adds ~100 KB to the bundle).
  const cf = (
    globalThis as Record<symbol, { ctx?: { waitUntil(p: Promise<unknown>): void } } | undefined>
  )[Symbol.for("__cloudflare-context__")];
  cf?.ctx?.waitUntil(sending); // next dev: no context, fire and forget
}
