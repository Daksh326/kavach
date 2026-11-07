import type { Metadata } from "next";
import { ClientMessages } from "@/i18n/client-messages";
import Form from "next/form";
import { ChevronRight, Search } from "lucide-react";
import { z } from "zod";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FlagActions } from "@/components/admin/flag-actions";
import { requireAdmin } from "@/lib/auth/dal";
import { displayIdentifier } from "@/lib/identifiers/normalize";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const searchSchema = z.object({ q: z.string().trim().max(200).optional().catch(undefined) });

export default async function AdminPage({ params, searchParams }: PageProps<"/[locale]/admin">) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale as "en" | "hi");
  await requireAdmin("/admin");
  const { q } = searchSchema.parse(sp);
  const [t, tr, format] = await Promise.all([
    getTranslations("admin"),
    getTranslations("flag.reasons"),
    getFormatter(),
  ]);

  const supabase = await createClient();
  const { data: flags } = await supabase
    .from("flags")
    .select(
      "id, reason, details, created_at, identifier_id, identifiers(type, value_normalized, distinct_reporter_count, hidden)",
    )
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(100);

  // Escape LIKE wildcards in the admin's search text.
  const like = q ? `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const { data: found } = like
    ? await supabase
        .from("identifiers")
        .select("id, type, value_normalized, distinct_reporter_count, hidden, merged_into_id")
        .ilike("value_normalized", like)
        .order("distinct_reporter_count", { ascending: false })
        .limit(25)
    : { data: null };

  return (
    <ClientMessages namespaces={["admin"]}>
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">{t("searchTitle")}</h2>
          <Form action={`/${locale}/admin`} className="flex gap-2">
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder={t("searchPlaceholder")}
              className="h-12 flex-1 text-base"
            />
            <Button type="submit" className="h-12">
              <Search aria-hidden />
              {t("search")}
            </Button>
          </Form>
          {found && (
            <ul className="divide-y rounded-xl border bg-card">
              {found.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">{t("noResults")}</li>
              )}
              {found.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/admin/identifier/${i.id}`}
                    className="flex items-center gap-3 p-3 hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block break-all font-mono text-sm">
                        {displayIdentifier(i.type, i.value_normalized)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {i.type} · {t("reporters", { count: i.distinct_reporter_count })}
                        {i.hidden && ` · ${t("hidden")}`}
                        {i.merged_into_id && ` · ${t("merged")}`}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">
            {t("queueTitle")} <Badge variant="secondary">{flags?.length ?? 0}</Badge>
          </h2>
          {!flags?.length ? (
            <p className="rounded-lg bg-muted p-4 text-sm">{t("queueEmpty")}</p>
          ) : (
            <ul className="space-y-3">
              {flags.map((f) => {
                const ident = Array.isArray(f.identifiers) ? f.identifiers[0] : f.identifiers;
                return (
                  <li key={f.id} className="space-y-2 rounded-xl border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/admin/identifier/${f.identifier_id}`}
                          className="break-all font-mono font-semibold text-primary underline-offset-4 hover:underline"
                        >
                          {ident
                            ? displayIdentifier(ident.type, ident.value_normalized)
                            : f.identifier_id}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {ident?.type} ·{" "}
                          {t("reporters", { count: ident?.distinct_reporter_count ?? 0 })}
                          {ident?.hidden && ` · ${t("hidden")}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {format.dateTime(new Date(f.created_at), {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                    <p className="text-sm">
                      <Badge variant="outline">{tr(f.reason)}</Badge>
                    </p>
                    {f.details && (
                      <p className="whitespace-pre-line rounded bg-muted p-2 text-sm">
                        {f.details}
                      </p>
                    )}
                    <FlagActions flagId={f.id} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </ClientMessages>
  );
}
