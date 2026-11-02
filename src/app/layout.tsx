import type { ReactNode } from "react";

// The real root layout (with <html lang>) is app/[locale]/layout.tsx.
// This pass-through exists for routes outside [locale] (API, auth callback).
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
