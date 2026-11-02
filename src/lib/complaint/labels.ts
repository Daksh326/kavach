import "server-only";
import { getTranslations } from "next-intl/server";
import { Constants } from "@/lib/supabase/database.types";
import type { ComplaintLabels, ComplaintLang } from "./build";

const E = Constants.public.Enums;

const toRecord = <K extends string>(keys: readonly K[], f: (k: K) => string) =>
  Object.fromEntries(keys.map((k) => [k, f(k)])) as Record<K, string>;

/** Enum labels in the complaint's language, from the message catalogs. */
export async function getComplaintLabels(lang: ComplaintLang): Promise<ComplaintLabels> {
  const [tc, tch, tpm, tk] = await Promise.all([
    getTranslations({ locale: lang, namespace: "categories" }),
    getTranslations({ locale: lang, namespace: "channels" }),
    getTranslations({ locale: lang, namespace: "paymentMethods" }),
    getTranslations({ locale: lang, namespace: "check.kinds" }),
  ]);
  return {
    category: toRecord(E.scam_category, (k) => tc(k)),
    channel: toRecord(E.report_channel, (k) => tch(k)),
    paymentMethod: toRecord(E.payment_method, (k) => tpm(k)),
    identifierType: toRecord(E.identifier_type, (k) => tk(k)),
  };
}
