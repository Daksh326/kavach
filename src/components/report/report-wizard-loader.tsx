"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// The wizard starts from on-device drafts (localStorage/IndexedDB) and URL
// params, so it renders client-side only; the page shell stays static.
export const ReportWizardLoader = dynamic(
  () => import("./report-wizard").then((m) => m.ReportWizard),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    ),
  },
);
