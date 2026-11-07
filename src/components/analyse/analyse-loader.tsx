"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// Client-only: it picks up the home page's handoff from sessionStorage.
export const AnalyseLoader = dynamic(
  () => import("./analyse-client").then((m) => m.AnalyseClient),
  {
    ssr: false,
    loading: () => (
      // Reserve roughly the real height so swapping in the form causes no layout shift.
      <div className="flex min-h-[27rem] justify-center pt-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    ),
  },
);
