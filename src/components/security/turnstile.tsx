"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { publicEnv } from "@/lib/env/public";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL =
  publicEnv.NEXT_PUBLIC_TURNSTILE_SCRIPT_URL ??
  "https://challenges.cloudflare.com/turnstile/v0/api.js";

let scriptPromise: Promise<TurnstileApi> | undefined;
function loadScript(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement("script");
    s.src = `${SCRIPT_URL}?render=explicit`;
    s.async = true;
    s.defer = true;
    s.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing"));
    s.onerror = () => {
      scriptPromise = undefined; // allow a retry on the next mount
      reject(new Error("turnstile script failed"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** True when bot protection is configured for this build. */
export const turnstileEnabled = Boolean(publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

export type TurnstileHandle = { reset: () => void };

/**
 * Cloudflare Turnstile, "interaction-only": invisible for most people,
 * a checkbox only when Cloudflare is unsure. Calls onToken with a fresh
 * single-use token (or null when it expires / fails). Renders nothing when
 * no site key is configured (local dev).
 */
export const Turnstile = forwardRef<
  TurnstileHandle,
  { action: string; onToken: (token: string | null) => void }
>(function Turnstile({ action, onToken }, ref) {
  const locale = useLocale();
  const el = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current(null);
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    },
  }));

  useEffect(() => {
    if (!turnstileEnabled || !el.current) return;
    let cancelled = false;
    loadScript()
      .then((ts) => {
        if (cancelled || !el.current) return;
        widgetId.current = ts.render(el.current, {
          sitekey: publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          action,
          language: locale,
          appearance: "interaction-only",
          size: "flexible",
          callback: (t: string) => onTokenRef.current(t),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [action, locale]);

  if (!turnstileEnabled) return null;
  return <div ref={el} className="min-h-0" data-testid="turnstile" />;
});

/**
 * Hook for forms: returns [state, ref]. Pass `ref` to <Turnstile ref={...}>.
 * The ref is kept out of `state` so render code never reads a ref.
 * When Turnstile is disabled, `ready` is always true and `token` undefined.
 */
export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null);
  const ref = useRef<TurnstileHandle>(null);
  const state = {
    token: token ?? undefined,
    ready: !turnstileEnabled || token !== null,
    onToken: setToken,
    /** Tokens are single-use: call after every submit attempt. */
    reset: () => ref.current?.reset(),
  };
  return [state, ref] as const;
}
