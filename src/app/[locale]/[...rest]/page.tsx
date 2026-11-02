import { notFound } from "next/navigation";

// Catch-all so unknown paths under a locale render the localised not-found page.
export default function CatchAll() {
  notFound();
}
