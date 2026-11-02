import { AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";

const COUNT = 6;

export async function RedFlags() {
  const t = await getTranslations("redFlags");
  const ti = t as unknown as (key: string) => string;
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <AlertTriangle className="size-5 text-warning" aria-hidden />
        {t("title")}
      </h2>
      <ul className="list-disc space-y-2 pl-5">
        {Array.from({ length: COUNT }, (_, i) => (
          <li key={i}>{ti(`items.${i + 1}`)}</li>
        ))}
      </ul>
    </section>
  );
}
