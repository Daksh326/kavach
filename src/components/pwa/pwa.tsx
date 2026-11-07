"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { WifiOff } from "lucide-react";
import { Link } from "@/i18n/navigation";

const REFRESH_KEY = "kavach:sw-refreshed-at";
const DAY = 86_400_000;

/** Registers the service worker (production only) and refreshes offline copies daily. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(async (reg) => {
        await navigator.serviceWorker.ready;
        let last = 0;
        try {
          last = Number(localStorage.getItem(REFRESH_KEY) ?? 0);
        } catch {
          // ignore
        }
        if (navigator.onLine && Date.now() - last > DAY) {
          reg.active?.postMessage("refresh-offline");
          try {
            localStorage.setItem(REFRESH_KEY, String(Date.now()));
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // Not fatal: the site works without offline support.
      });
  }, []);
  return null;
}

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** A small banner when the device is offline, pointing to the emergency steps. */
export function OfflineBanner() {
  const t = useTranslations("offline");
  const offline = useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    () => false,
  );
  if (!offline) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm font-medium text-black"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span>{t("banner")}</span>
      <Link href="/emergency" className="underline underline-offset-2">
        {t("openEmergency")}
      </Link>
    </div>
  );
}
