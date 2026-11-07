"use client";

import { publicEnv } from "@/lib/env/public";

/**
 * Minimal, privacy-first PostHog client (capture HTTP API, no SDK).
 * - Anonymous events only ($process_person_profile: false), with a random id
 *   that lives for the browser session. No cookies, no autocapture, no replay.
 * - Never send identifiers, message text, emails or anything a user typed:
 *   only coarse properties (kind, risk level, category, counts).
 * - Respects Do Not Track / Global Privacy Control.
 */
export type AnalyticsEvent =
  | "$pageview"
  | "check_performed"
  | "analyse_completed"
  | "report_step_viewed"
  | "report_submitted"
  | "emergency_step_done"
  | "flag_submitted";

type Props = Record<string, string | number | boolean | undefined>;

const KEY = publicEnv.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = (publicEnv.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com").replace(/\/$/, "");
const SESSION_KEY = "kavach:aid";

function optedOut(): boolean {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.globalPrivacyControl === true || n.doNotTrack === "1";
}

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

/** Strip ids from paths (/report/<uuid> -> /report/:id). */
export function cleanPath(path: string): string {
  return path
    .split("?")[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
}

export function track(event: AnalyticsEvent, props: Props = {}) {
  if (!KEY || typeof window === "undefined" || optedOut()) return;
  const path = cleanPath(window.location.pathname);
  const body = JSON.stringify({
    api_key: KEY,
    event,
    distinct_id: sessionId(),
    timestamp: new Date().toISOString(),
    properties: {
      ...props,
      $process_person_profile: false,
      $current_url: `${window.location.origin}${path}`,
      $pathname: path,
      $lib: "kavach-lite",
      locale: document.documentElement.lang,
    },
  });
  void fetch(`${HOST}/i/v0/e/`, {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body,
  }).catch(() => undefined);
}
