import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Ban,
  Camera,
  ExternalLink,
  Landmark,
  MessageSquareWarning,
  PhoneCall,
  PhoneOff,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  ChecklistProgress,
  ChecklistProvider,
  StepMarker,
  StepToggle,
} from "@/components/emergency/checklist";

type StepId = "call1930" | "portal" | "bank" | "chakshu" | "evidence" | "secure" | "recovery";

type Step = {
  id: StepId;
  icon: LucideIcon;
  /** Number of list items under steps.<id>.items */
  items?: number;
  hasBody?: boolean;
  hasListTitle?: boolean;
  hasNote?: boolean;
  hasExtra?: boolean;
  action?: { href: string; external: boolean; urgent?: boolean };
};

// Order matters: money first (1930 -> portal -> bank), then evidence and safety.
const STEPS: Step[] = [
  {
    id: "call1930",
    icon: PhoneCall,
    hasBody: true,
    hasListTitle: true,
    items: 3,
    hasNote: true,
    action: { href: "tel:1930", external: false, urgent: true },
  },
  {
    id: "portal",
    icon: Landmark,
    hasBody: true,
    action: { href: "https://cybercrime.gov.in/", external: true },
  },
  { id: "bank", icon: Ban, hasBody: true, hasNote: true, hasExtra: true },
  {
    id: "chakshu",
    icon: MessageSquareWarning,
    hasBody: true,
    action: { href: "https://sancharsaathi.gov.in/", external: true },
  },
  { id: "evidence", icon: Camera, hasBody: true, items: 4, hasNote: true },
  { id: "secure", icon: Smartphone, items: 3 },
  { id: "recovery", icon: ShieldCheck, hasBody: true },
];

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/emergency">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as "en" | "hi", namespace: "emergency" });
  return { title: t("metaTitle"), description: t("intro") };
}

export default async function EmergencyPage({ params }: PageProps<"/[locale]/emergency">) {
  const { locale } = await params;
  setRequestLocale(locale as "en" | "hi");
  const t = await getTranslations("emergency");
  // Step copy is looked up by id; key parity is enforced by src/i18n/messages.test.ts.
  const ts = t as unknown as (key: string) => string;

  return (
    <article className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold leading-tight">{t("title")}</h1>
        <p className="text-lg">{t("intro")}</p>
      </header>

      <div
        role="note"
        className="flex gap-3 rounded-xl border-2 border-destructive bg-destructive/5 p-4"
      >
        <PhoneOff className="mt-0.5 size-6 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="font-bold text-destructive">{t("hangUpTitle")}</p>
          <p>{t("hangUpBody")}</p>
        </div>
      </div>

      <ChecklistProvider total={STEPS.length}>
        <div className="sticky top-0 z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur">
          <ChecklistProgress template={t.raw("progress") as string} />
        </div>

        <ol className="space-y-4">
          {STEPS.map((step, index) => (
            <StepCard
              key={step.id}
              step={step}
              number={index + 1}
              title={ts(`steps.${step.id}.title`)}
              doneLabel={t("markDone")}
            >
              {step.hasBody && <p>{ts(`steps.${step.id}.body`)}</p>}
              {step.hasListTitle && (
                <p className="font-semibold">{ts(`steps.${step.id}.listTitle`)}</p>
              )}
              {step.items && (
                <ul className="list-disc space-y-1 pl-5">
                  {Array.from({ length: step.items }, (_, i) => (
                    <li key={i}>{ts(`steps.${step.id}.items.${i + 1}`)}</li>
                  ))}
                </ul>
              )}
              {step.hasNote && (
                <p className="rounded-lg bg-muted p-3 text-sm">{ts(`steps.${step.id}.note`)}</p>
              )}
              {step.hasExtra && (
                <p className="text-sm text-muted-foreground">{ts(`steps.${step.id}.extra`)}</p>
              )}
              {step.action && (
                <a
                  href={step.action.href}
                  {...(step.action.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className={cn(
                    "flex h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-base font-semibold",
                    step.action.urgent
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {ts(`steps.${step.id}.action`)}
                  {step.action.external && <ExternalLink className="size-4" aria-hidden />}
                </a>
              )}
            </StepCard>
          ))}
        </ol>
      </ChecklistProvider>

      <p className="rounded-xl bg-accent p-4 text-accent-foreground">{t("notYourFault")}</p>

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="text-xl font-bold">{t("nextTitle")}</h2>
        <p>{t("nextBody")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href="/report"
            className="flex h-12 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground"
          >
            {t("reportAction")}
          </Link>
          <Link
            href="/check"
            className="flex h-12 items-center justify-center rounded-lg border-2 border-primary px-4 font-semibold text-primary"
          >
            {t("nextAction")}
          </Link>
        </div>
      </section>
    </article>
  );
}

function StepCard({
  step,
  number,
  title,
  doneLabel,
  children,
}: {
  step: Step;
  number: number;
  title: string;
  doneLabel: string;
  children: ReactNode;
}) {
  const Icon = step.icon;
  return (
    <li id={step.id} className="scroll-mt-24 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <StepMarker id={step.id} number={number} />
        <div className="min-w-0 flex-1 space-y-3">
          <h2 className="flex items-start gap-2 text-lg font-bold leading-snug">
            <Icon className="mt-1 size-5 shrink-0 text-primary" aria-hidden />
            <span>{title}</span>
          </h2>
          {children}
          <StepToggle id={step.id} label={doneLabel} />
        </div>
      </div>
    </li>
  );
}
