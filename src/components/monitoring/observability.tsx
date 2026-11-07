"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track, type AnalyticsEvent } from "@/lib/analytics/track";
import { captureClientError } from "@/lib/monitoring/client";

/** Uncaught browser errors -> Sentry; route changes -> anonymous page views. */
export function Observability() {
  const pathname = usePathname();

  useEffect(() => {
    const onError = (e: ErrorEvent) =>
      captureClientError(e.error ?? e.message, { source: "onerror" });
    const onRejection = (e: PromiseRejectionEvent) =>
      captureClientError(e.reason, { source: "unhandledrejection" });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    track("$pageview");
  }, [pathname]);

  return null;
}

/** Fire one analytics event when a server-rendered result is shown. */
export function TrackOnce({
  event,
  props,
}: {
  event: AnalyticsEvent;
  props: Record<string, string | number | boolean>;
}) {
  const key = JSON.stringify(props);
  useEffect(() => {
    track(event, JSON.parse(key));
  }, [event, key]);
  return null;
}
