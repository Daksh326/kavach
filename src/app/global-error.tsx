"use client";

import { useEffect } from "react";
import { captureClientError } from "@/lib/monitoring/client";
import "./globals.css";

/**
 * Last-resort fallback when the root layout itself fails (no i18n available
 * here, so the text is bilingual and minimal).
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    captureClientError(error, { source: "global-error" });
  }, [error]);
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">Something went wrong · कुछ गड़बड़ हो गई</h1>
          <p>If you have lost money, call 1930 now. · पैसे कटे हैं तो अभी 1930 पर कॉल करें।</p>
          <p>
            <a className="font-semibold text-destructive underline" href="tel:1930">
              1930
            </a>
          </p>
        </div>
      </body>
    </html>
  );
}
