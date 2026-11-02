import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

export const metadata: Metadata = { robots: { index: false } };

// Phase 1: proves auth + RLS end to end. Phase 3 builds the real dashboard.
export default async function DashboardPage({ params }: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  setRequestLocale(locale as "en" | "hi");
  const user = await requireUser("/dashboard");
  const t = await getTranslations();

  const supabase = await createClient();
  const { data: reports } = await supabase
    .from("reports")
    .select("id, category, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <section className="space-y-6">
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

      {!reports?.length ? (
        <p className="text-muted-foreground">{t("dashboard.empty")}</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {reports.map((r) => (
            <li key={r.id} className="flex justify-between gap-4 p-4 text-sm">
              <span className="font-medium">{r.category}</span>
              <span className="text-muted-foreground">{r.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
