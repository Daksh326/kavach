import type { Metadata } from "next";
import { ClientMessages } from "@/i18n/client-messages";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNextPath } from "@/lib/validation/auth";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale as "en" | "hi");
  const sp = await searchParams;
  const next = safeNextPath.parse(typeof sp.next === "string" ? sp.next : undefined);
  const initialError = sp.error === "oauthFailed" ? "oauthFailed" : undefined;
  const t = await getTranslations("auth");

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </CardTitle>
        <CardDescription className="text-base">{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ClientMessages namespaces={["auth"]}>
          <LoginForm next={next} initialError={initialError} />
        </ClientMessages>
      </CardContent>
    </Card>
  );
}
