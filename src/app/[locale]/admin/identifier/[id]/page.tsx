import type { Metadata } from "next";
import { ClientMessages } from "@/i18n/client-messages";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { HideToggle } from "@/components/admin/hide-toggle";
import { MergeForm } from "@/components/admin/merge-form";
import { requireAdmin } from "@/lib/auth/dal";
import { displayIdentifier } from "@/lib/identifiers/normalize";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminIdentifierPage({
  params,
}: PageProps<"/[locale]/admin/identifier/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale as "en" | "hi");
  if (!z.uuid().safeParse(id).success) notFound();
  await requireAdmin(`/admin/identifier/${id}`);
  const [t, tc, tch, tr, format] = await Promise.all([
    getTranslations("admin"),
    getTranslations("categories"),
    getTranslations("channels"),
    getTranslations("flag.reasons"),
    getFormatter(),
  ]);

  const supabase = await createClient();
  const [{ data: ident }, { data: links }, { data: flags }] = await Promise.all([
    supabase.from("identifiers").select("*").eq("id", id).maybeSingle(),
    // Reporters' identities are never selected: moderators see what was reported, not by whom.
    supabase
      .from("report_identifiers")
      .select("report_id, reports(category, channel, description, created_at)")
      .eq("identifier_id", id)
      .limit(50),
    supabase
      .from("flags")
      .select("id, reason, details, status, created_at")
      .eq("identifier_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!ident) notFound();
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric" });

  return (
    <ClientMessages namespaces={["admin"]}>
      <article className="space-y-6">
        <Link href="/admin" className="text-sm text-primary underline-offset-4 hover:underline">
          ← {t("back")}
        </Link>
        <header className="space-y-2">
          <h1 className="break-all font-mono text-xl font-bold">
            {displayIdentifier(ident.type, ident.value_normalized)}
          </h1>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">{ident.type}</Badge>
            <Badge variant="secondary">
              {t("reporters", { count: ident.distinct_reporter_count })}
            </Badge>
            <Badge variant="secondary">{t("reports", { count: ident.report_count })}</Badge>
            {ident.hidden && <Badge variant="destructive">{t("hidden")}</Badge>}
            {ident.merged_into_id && (
              <Link href={`/admin/identifier/${ident.merged_into_id}`}>
                <Badge variant="outline">{t("merged")} →</Badge>
              </Link>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("seen", { first: date(ident.first_seen), last: date(ident.last_seen) })}
          </p>
        </header>

        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="font-bold">{t("visibility")}</h2>
          <p className="text-sm text-muted-foreground">
            {ident.hidden ? t("hiddenHint") : t("visibleHint")}
          </p>
          <HideToggle identifierId={ident.id} hidden={ident.hidden} />
        </section>

        {!ident.merged_into_id && (
          <section className="space-y-2 rounded-xl border bg-card p-4">
            <h2 className="font-bold">{t("mergeTitle")}</h2>
            <MergeForm sourceId={ident.id} sourceType={ident.type} />
          </section>
        )}

        <section className="space-y-2">
          <h2 className="font-bold">{t("reportsTitle")}</h2>
          <ul className="space-y-2">
            {(links ?? []).map((l) => {
              const r = Array.isArray(l.reports) ? l.reports[0] : l.reports;
              if (!r) return null;
              return (
                <li key={l.report_id} className="space-y-1 rounded-lg border bg-card p-3 text-sm">
                  <p className="font-medium">
                    {tc(r.category)} · {tch(r.channel)}{" "}
                    <span className="text-muted-foreground">· {date(r.created_at)}</span>
                  </p>
                  {r.description && (
                    <p className="line-clamp-4 whitespace-pre-line text-muted-foreground">
                      {r.description}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">{t("flagsTitle")}</h2>
          {!flags?.length ? (
            <p className="text-sm text-muted-foreground">{t("noFlags")}</p>
          ) : (
            <ul className="space-y-2">
              {flags.map((f) => (
                <li key={f.id} className="space-y-1 rounded-lg border bg-card p-3 text-sm">
                  <p>
                    <Badge variant="outline">{tr(f.reason)}</Badge>{" "}
                    <span className="text-muted-foreground">
                      {f.status} · {date(f.created_at)}
                    </span>
                  </p>
                  {f.details && <p className="whitespace-pre-line">{f.details}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </ClientMessages>
  );
}
