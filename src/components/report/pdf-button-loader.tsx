"use client";

import dynamic from "next/dynamic";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

// ssr:false keeps the PDF button, and the react-pdf import inside it, out of
// the server bundle entirely (react-pdf + fontkit add ~1.7 MB, and the
// Workers free plan caps the worker at 3 MiB compressed). The heavy library
// still loads only when the user taps the button.
export const PdfButtonLoader = dynamic(() => import("./pdf-button").then((m) => m.PdfButton), {
  ssr: false,
  loading: () => (
    <Button type="button" variant="outline" size="lg" className="h-12 w-full text-base" disabled>
      <FileDown aria-hidden />
      PDF
    </Button>
  ),
});
