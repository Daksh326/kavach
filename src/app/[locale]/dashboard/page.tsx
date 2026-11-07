import type { Metadata } from "next";
import { ClientMessages } from "@/i18n/client-messages";
import { ChevronRight, Download, Plus } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteAccount } from "@/components/dashboard/delete-account";
import { getCurrentProfile, requireUser } from "@/lib/auth/dal";
import { formatInr } from "@/lib/complaint/build";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const EXPORT_URL = "/api/me/export";

export default async function DashboardPage({ params }: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  setRequestLocale(locale as "en" | "hi");
  const user = await requireUser("/dashboard");
  const profile = await getCurrentProfile();
  const [t, tc, ts, format] = await Promise.all([
    getTranslations(),
    getTranslations("categories"),
    getTranslations("statuses"),
    getFormatter(),
  ]);

  const supabase = await createClient();
  const { data: reports } = await supabase
    .from("reports")
    .select("id, category, status, amount_lost, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.signedInAs", { email: user.email ?? "" })}
          </p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="h-11">
            {t("common.signOut")}
          </Button>
        </form>
      </div>

      {profile?.role === "admin" && (
        <Link
          href="/admin"
          className="block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("dashboard.adminLink")}
        </Link>
      )}

      <Link
        href="/report"
        className="flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground"
      >
        <Plus className="size-5" aria-hidden />
        {t("dashboard.newReport")}
      </Link>

      <section className="space-y-2">
        <p className="text-sm text-muted-foreground">{t("dashboard.intro")}</p>
        {!reports?.length ? (
          <p className="rounded-lg bg-muted p-4">{t("dashboard.empty")}</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/report/${r.id}`}
                  className="flex items-center gap-3 p-4 hover:bg-accent"
                >
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block font-medium">{tc(r.category)}</span>
                    <span className="block text-sm text-muted-foreground">
                      {t("dashboard.reportedOn", {
                        date: format.dateTime(new Date(r.created_at), {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }),
                      })}
                      {" · "}
                      {(r.amount_lost ?? 0) > 0
                        ? formatInr(r.amount_lost!, locale === "hi" ? "hi" : "en")
                        : t("dashboard.noAmount")}
                    </span>
                    <Badge variant={r.status === "resolved" ? "secondary" : "outline"}>
                      {ts(r.status)}
                    </Badge>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">{t("dashboard.privacyTitle")}</h2>
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <h3 className="font-bold">{t("dashboard.exportTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("dashboard.exportBody")}</p>
          {/* A file download from a route handler, not a page: <Link> doesn't apply. */}
          <a
            href={EXPORT_URL}
            download
            className="inline-flex h-11 items-center gap-2 rounded-md border px-4 text-sm font-semibold hover:bg-accent"
          >
            <Download className="size-4" aria-hidden />
            {t("dashboard.exportButton")}
          </a>
        </div>
        <ClientMessages namespaces={["dashboard"]}>
          <DeleteAccount />
        </ClientMessages>
      </section>
    </div>
  );
}
