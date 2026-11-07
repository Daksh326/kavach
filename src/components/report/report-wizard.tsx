"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Constants } from "@/lib/supabase/database.types";
import { useRouter } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EVIDENCE_ACCEPT, EVIDENCE_MAX_FILES } from "@/lib/evidence/rules";
import {
  REPORT_IDENTIFIER_TYPES,
  SOCIAL_PLATFORMS,
  displayIdentifier,
  normalizeReportIdentifierPrimary,
  type ReportIdentifierType,
} from "@/lib/identifiers/basic";
import { stripSensitive } from "@/lib/redact/sensitive";
import {
  clearDraftFiles,
  clearFormDraft,
  deleteDraftFile,
  listDraftFiles,
  loadFormDraft,
  putDraftFile,
  saveFormDraft,
  type DraftFile,
} from "@/lib/report/draft-store";
import {
  formatBytes,
  prepareFiles,
  uploadEvidence,
  type PrepareIssue,
} from "@/lib/report/evidence-client";
import { emptyReportForm, reportFormSchema, type ReportFormValues } from "@/lib/validation/report";
import { clearReportPrefill, readReportPrefill } from "@/lib/report/prefill";
import { getSessionStatus, submitReport } from "@/app/[locale]/report/actions";
import { Turnstile, useTurnstile } from "@/components/security/turnstile";
import { track } from "@/lib/analytics/track";
import { FieldError, RadioCard, selectClass } from "./fields";

const E = Constants.public.Enums;

const STEPS = [
  { id: "what", fields: ["category", "description"] },
  { id: "channel", fields: ["channel"] },
  { id: "identifiers", fields: ["identifiers"] },
  {
    id: "money",
    fields: [
      "incidentDate",
      "lostMoney",
      "amountLost",
      "paymentMethod",
      "bankAccountLast4",
      "transactionRef",
    ],
  },
  { id: "evidence", fields: [] },
  { id: "consent", fields: ["consent"] },
  { id: "review", fields: [] },
] as const;
const REVIEW = STEPS.length - 1;

/** Client-only (rendered with ssr:false), so reading storage/URL here is safe. */
function initialState() {
  const params = new URLSearchParams(window.location.search);
  const draft = loadFormDraft();
  const values: ReportFormValues = {
    ...emptyReportForm,
    ...(draft?.values ?? {}),
  } as ReportFormValues;

  // Prefill from "Report it" on /check (scammer identifiers, not personal data).
  const type = params.get("type");
  const value = params.get("value")?.slice(0, 512);
  if (
    type &&
    value &&
    (REPORT_IDENTIFIER_TYPES as readonly string[]).includes(type) &&
    !values.identifiers.some((i) => i.value === value)
  ) {
    values.identifiers = [
      ...values.identifiers,
      { type: type as ReportIdentifierType, value, platform: "instagram" },
    ];
  }
  // One-shot handoff from /analyse "Report this" (cleared after mount).
  const prefill = readReportPrefill();
  if (prefill) {
    if (!values.category && prefill.category) values.category = prefill.category;
    if (!values.description && prefill.description) values.description = prefill.description;
    for (const id of prefill.identifiers ?? []) {
      if (values.identifiers.length >= 10) break;
      if (!values.identifiers.some((i) => i.value === id.value)) {
        values.identifiers = [...values.identifiers, { ...id, platform: "instagram" }];
      }
    }
  }
  const resume = params.get("resume") === "1";
  return {
    values,
    step: resume ? REVIEW : Math.min(draft?.step ?? 0, REVIEW),
    restored: !!draft && !resume,
  };
}

export function ReportWizard() {
  const t = useTranslations("report");
  const tc = useTranslations("categories");
  const tch = useTranslations("channels");
  const tpm = useTranslations("paymentMethods");
  const router = useRouter();
  const tx = t as unknown as (key: string, values?: Record<string, string | number>) => string;

  const [init] = useState(initialState);
  const [step, setStep] = useState(init.step);
  const [restored, setRestored] = useState(init.restored);
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [issues, setIssues] = useState<PrepareIssue[]>([]);
  const [hashing, setHashing] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<{ current: number; total: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bot, botRef] = useTurnstile();

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: init.values,
    mode: "onTouched",
  });
  const { register, control, formState, trigger, getValues, setError, clearErrors } = form;
  const { fields: idFields, append, remove } = useFieldArray({ control, name: "identifiers" });
  const values = useWatch({ control }) as ReportFormValues;

  // Autosave to this device only: typing is debounced; step changes and
  // leaving the page (tab switch, app killed) save immediately. After a
  // successful submit, saving stops for good so a late timer can't
  // resurrect the submitted report as a draft.
  const finished = useRef(false);
  const save = useCallback(() => {
    if (!finished.current) saveFormDraft(getValues(), step);
  }, [getValues, step]);

  useEffect(() => {
    save();
  }, [save]);

  useEffect(() => {
    const id = setTimeout(save, 400);
    return () => clearTimeout(id);
  }, [values, save]);

  useEffect(() => {
    const onVisibility = () => document.visibilityState === "hidden" && save();
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [save]);

  useEffect(() => clearReportPrefill(), []);

  useEffect(() => {
    track("report_step_viewed", { step: STEPS[step].id });
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    listDraftFiles().then((f) => !cancelled && setFiles(f));
    // A tiny Server Action instead of shipping supabase-js to the browser.
    getSessionStatus()
      .then((r) => !cancelled && setSignedIn(r.signedIn))
      .catch(() => !cancelled && setSignedIn(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Any error key with a message in report.errors is shown; unknown keys fall back.
  const err = (msg?: string) =>
    msg ? tx(`errors.${t.has(`errors.${msg}` as never) ? msg : "serviceUnavailable"}`) : undefined;

  const removedKinds = useMemo(
    () => stripSensitive(values.description ?? "").removed,
    [values.description],
  );

  async function next() {
    const current = STEPS[step];
    const ok = await trigger(current.fields as unknown as FieldPath<ReportFormValues>[]);
    if (current.id === "consent" && !getValues("consent")) {
      setError("consent", { message: "consentRequired" });
      return;
    }
    if (!ok) return;
    setStep((s) => Math.min(s + 1, REVIEW));
    window.scrollTo({ top: 0 });
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0 });
  }

  async function onPickFiles(list: FileList | null) {
    if (!list?.length) return;
    setIssues([]);
    const { ready, issues: found } = await prepareFiles([...list], files.length, setHashing);
    setHashing(null);
    for (const f of ready) await putDraftFile(f);
    setFiles((prev) => [...prev, ...ready]);
    setIssues(found);
  }

  async function removeFile(id: string) {
    await deleteDraftFile(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function goToLogin() {
    saveFormDraft(getValues(), REVIEW);
    router.push(`/login?next=${encodeURIComponent("/report?resume=1")}`);
  }

  async function startOver() {
    clearFormDraft();
    await clearDraftFiles();
    form.reset(emptyReportForm);
    setFiles([]);
    setRestored(false);
    setStep(0);
  }

  async function onSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    const res = await submitReport(getValues(), { turnstileToken: bot.token });
    bot.reset(); // single-use token
    if (!res.ok) {
      setSubmitting(false);
      if (res.error === "signInRequired") return goToLogin();
      return setSubmitError(res.error);
    }
    finished.current = true;
    track("report_submitted", {
      category: getValues("category"),
      lost_money: getValues("lostMoney") === "yes",
      evidence_files: files.length,
    });
    let failed = 0;
    for (const [i, f] of files.entries()) {
      setUploading({ current: i + 1, total: files.length });
      if ((await uploadEvidence(res.data.reportId, f)) !== "ok") failed++;
    }
    clearFormDraft();
    await clearDraftFiles();
    router.push(`/report/${res.data.reportId}?new=1${failed ? "&upload=failed" : ""}`);
  }

  const stepId = STEPS[step].id;
  const lostMoney = values.lostMoney === "yes";

  return (
    <div className="space-y-5">
      {restored && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-accent p-3 text-sm">
          <span>{t("draftRestored")}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 shrink-0"
            onClick={startOver}
          >
            {t("startOver")}
          </Button>
        </div>
      )}

      <div className="space-y-2" aria-live="polite">
        <p className="text-sm font-medium text-muted-foreground">
          {t("stepOf", { current: String(step + 1), total: String(STEPS.length) })}
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <h2 className="text-xl font-bold">{tx(`steps.${stepId}.title`)}</h2>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step < REVIEW) void next();
        }}
        className="space-y-5"
      >
        {stepId === "what" && (
          <>
            <fieldset className="space-y-2">
              <legend className="mb-2 font-medium">{t("steps.what.categoryLabel")}</legend>
              {E.scam_category.map((c) => (
                <RadioCard key={c} value={c} label={tc(c)} {...register("category")} />
              ))}
              <FieldError>{err(formState.errors.category?.message)}</FieldError>
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-base">
                {t("steps.what.descriptionLabel")}
              </Label>
              <p id="description-hint" className="text-sm text-muted-foreground">
                {t("steps.what.descriptionHint")}
              </p>
              <Textarea
                id="description"
                rows={6}
                maxLength={5000}
                aria-describedby="description-hint"
                className="min-h-36 text-base"
                {...register("description")}
              />
            </div>
          </>
        )}

        {stepId === "channel" && (
          <fieldset className="space-y-2">
            <legend className="sr-only">{t("steps.channel.title")}</legend>
            {E.report_channel.map((c) => (
              <RadioCard key={c} value={c} label={tch(c)} {...register("channel")} />
            ))}
            <FieldError>{err(formState.errors.channel?.message)}</FieldError>
          </fieldset>
        )}

        {stepId === "identifiers" && (
          <div className="space-y-4">
            <p className="text-muted-foreground">{t("steps.identifiers.hint")}</p>
            {idFields.length === 0 && (
              <p className="rounded-lg bg-muted p-3 text-sm">{t("steps.identifiers.empty")}</p>
            )}
            {idFields.map((field, i) => {
              const row = values.identifiers?.[i];
              const normalized = row ? normalizeReportIdentifierPrimary(row) : null;
              const fieldErr = formState.errors.identifiers?.[i]?.value?.message;
              return (
                <div key={field.id} className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`id-type-${i}`}>{t("steps.identifiers.typeLabel")}</Label>
                      <select
                        id={`id-type-${i}`}
                        className={selectClass}
                        {...register(`identifiers.${i}.type`)}
                      >
                        {REPORT_IDENTIFIER_TYPES.map((ty) => (
                          <option key={ty} value={ty}>
                            {tx(`steps.identifiers.types.${ty}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {row?.type === "social" && (
                      <div className="space-y-1">
                        <Label htmlFor={`id-platform-${i}`}>
                          {t("steps.identifiers.platformLabel")}
                        </Label>
                        <select
                          id={`id-platform-${i}`}
                          className={selectClass}
                          {...register(`identifiers.${i}.platform`)}
                        >
                          {SOCIAL_PLATFORMS.map((p) => (
                            <option key={p} value={p}>
                              {tx(`steps.identifiers.platforms.${p}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`id-value-${i}`}>{t("steps.identifiers.valueLabel")}</Label>
                    <Input
                      id={`id-value-${i}`}
                      className="h-12 text-base"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode={
                        row?.type === "phone"
                          ? "tel"
                          : row?.type === "email"
                            ? "email"
                            : row?.type === "url"
                              ? "url"
                              : "text"
                      }
                      placeholder={tx(`steps.identifiers.placeholders.${row?.type ?? "phone"}`)}
                      aria-invalid={!!fieldErr}
                      {...register(`identifiers.${i}.value`)}
                    />
                    {normalized && !fieldErr && (
                      <p className="text-sm text-success">
                        ✓ {normalized.map((n) => displayIdentifier(n.type, n.value)).join(" · ")}
                      </p>
                    )}
                    <FieldError>{err(fieldErr)}</FieldError>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 text-destructive"
                    onClick={() => remove(i)}
                  >
                    <Trash2 aria-hidden />
                    {t("steps.identifiers.remove")}
                  </Button>
                </div>
              );
            })}
            {idFields.length < 10 && (
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full text-base"
                onClick={() => append({ type: "phone", value: "", platform: "instagram" })}
              >
                <Plus aria-hidden />
                {idFields.length === 0
                  ? t("steps.identifiers.add")
                  : t("steps.identifiers.addAnother")}
              </Button>
            )}
          </div>
        )}

        {stepId === "money" && (
          <div className="space-y-5">
            <div className="space-y-1">
              <Label htmlFor="incidentDate" className="text-base">
                {t("steps.money.dateLabel")}
              </Label>
              <Input
                id="incidentDate"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                className="h-12 text-base"
                {...register("incidentDate")}
              />
              <FieldError>{err(formState.errors.incidentDate?.message)}</FieldError>
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-2 font-medium">{t("steps.money.lostMoneyLabel")}</legend>
              <div className="grid grid-cols-2 gap-2">
                <RadioCard value="yes" label={t("steps.money.yes")} {...register("lostMoney")} />
                <RadioCard value="no" label={t("steps.money.no")} {...register("lostMoney")} />
              </div>
              <FieldError>{err(formState.errors.lostMoney?.message)}</FieldError>
            </fieldset>
            {lostMoney && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="amountLost" className="text-base">
                    {t("steps.money.amountLabel")}
                  </Label>
                  <Input
                    id="amountLost"
                    inputMode="decimal"
                    className="h-12 text-base"
                    {...register("amountLost")}
                  />
                  <FieldError>{err(formState.errors.amountLost?.message)}</FieldError>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="paymentMethod" className="text-base">
                    {t("steps.money.methodLabel")}
                  </Label>
                  <select id="paymentMethod" className={selectClass} {...register("paymentMethod")}>
                    <option value="">{t("steps.money.methodPlaceholder")}</option>
                    {E.payment_method
                      .filter((m) => m !== "none")
                      .map((m) => (
                        <option key={m} value={m}>
                          {tpm(m)}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="transactionRef" className="text-base">
                    {t("steps.money.txnLabel")}
                  </Label>
                  <p className="text-sm text-muted-foreground">{t("steps.money.txnHint")}</p>
                  <Input
                    id="transactionRef"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-12 text-base"
                    {...register("transactionRef")}
                  />
                  <FieldError>{err(formState.errors.transactionRef?.message)}</FieldError>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bankAccountLast4" className="text-base">
                    {t("steps.money.last4Label")}
                  </Label>
                  <p className="text-sm text-muted-foreground">{t("steps.money.last4Hint")}</p>
                  <Input
                    id="bankAccountLast4"
                    inputMode="numeric"
                    maxLength={4}
                    autoComplete="off"
                    className="h-12 w-32 text-base"
                    {...register("bankAccountLast4")}
                  />
                  <FieldError>{err(formState.errors.bankAccountLast4?.message)}</FieldError>
                </div>
              </>
            )}
          </div>
        )}

        {stepId === "evidence" && (
          <div className="space-y-4">
            <p className="text-muted-foreground">{t("steps.evidence.hint")}</p>
            <p className="flex gap-2 rounded-lg bg-muted p-3 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("steps.evidence.privateNote")}
            </p>
            {files.length === 0 && !hashing && (
              <p className="text-sm text-muted-foreground">{t("steps.evidence.empty")}</p>
            )}
            <ul className="space-y-2">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                  <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{f.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatBytes(f.size)}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0"
                    aria-label={t("steps.evidence.remove")}
                    onClick={() => removeFile(f.id)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            {hashing && (
              <p className="flex items-center gap-2 text-sm" aria-live="polite">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("steps.evidence.processing", { name: hashing })}
              </p>
            )}
            {issues.map((iss, i) => (
              <FieldError key={i}>
                {tx(`steps.evidence.${iss.kind}`, { name: iss.name })}
              </FieldError>
            ))}
            {files.length < EVIDENCE_MAX_FILES && (
              <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary text-base font-semibold text-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                <Upload className="size-5" aria-hidden />
                {t("steps.evidence.add")}
                <input
                  type="file"
                  multiple
                  accept={EVIDENCE_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    void onPickFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        )}

        {stepId === "consent" && (
          <div className="space-y-4">
            <section className="space-y-2 rounded-xl border bg-card p-4">
              <h3 className="font-semibold">{t("steps.consent.purposeTitle")}</h3>
              <ul className="list-disc space-y-2 pl-5">
                {(["purpose1", "purpose2", "purpose3", "purpose4"] as const).map((k) => (
                  <li key={k}>{t(`steps.consent.${k}`)}</li>
                ))}
              </ul>
            </section>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 has-[:checked]:border-primary has-[:checked]:bg-accent">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0 accent-[var(--primary)]"
                {...register("consent", { onChange: () => clearErrors("consent") })}
              />
              <span className="font-medium">{t("steps.consent.checkbox")}</span>
            </label>
            <FieldError>{err(formState.errors.consent?.message)}</FieldError>
          </div>
        )}

        {stepId === "review" && (
          <div className="space-y-4">
            <dl className="divide-y rounded-xl border bg-card">
              <ReviewRow
                label={t("fields.category")}
                value={values.category ? tc(values.category) : undefined}
                onEdit={() => setStep(0)}
                editLabel={t("steps.review.edit")}
                empty={t("steps.review.notGiven")}
              />
              <ReviewRow
                label={t("fields.description")}
                value={values.description?.trim() || undefined}
                onEdit={() => setStep(0)}
                editLabel={t("steps.review.edit")}
                empty={t("steps.review.notGiven")}
                multiline
              />
              <ReviewRow
                label={t("fields.channel")}
                value={values.channel ? tch(values.channel) : undefined}
                onEdit={() => setStep(1)}
                editLabel={t("steps.review.edit")}
                empty={t("steps.review.notGiven")}
              />
              <ReviewRow
                label={t("fields.identifiers")}
                value={
                  (values.identifiers ?? [])
                    .flatMap((r) => normalizeReportIdentifierPrimary(r) ?? [])
                    .filter((n) => n.type !== "domain")
                    .map((n) => displayIdentifier(n.type, n.value))
                    .join("\n") || undefined
                }
                onEdit={() => setStep(2)}
                editLabel={t("steps.review.edit")}
                empty={t("steps.review.notGiven")}
                multiline
              />
              <ReviewRow
                label={t("fields.date")}
                value={values.incidentDate || undefined}
                onEdit={() => setStep(3)}
                editLabel={t("steps.review.edit")}
                empty={t("steps.review.notGiven")}
              />
              <ReviewRow
                label={t("fields.amount")}
                value={
                  lostMoney
                    ? `₹${values.amountLost}${values.paymentMethod ? ` · ${tpm(values.paymentMethod)}` : ""}`
                    : t("steps.money.no")
                }
                onEdit={() => setStep(3)}
                editLabel={t("steps.review.edit")}
                empty={t("steps.review.notGiven")}
              />
              {lostMoney && (
                <ReviewRow
                  label={t("fields.txn")}
                  value={values.transactionRef || undefined}
                  onEdit={() => setStep(3)}
                  editLabel={t("steps.review.edit")}
                  empty={t("steps.review.notGiven")}
                />
              )}
              <ReviewRow
                label={t("fields.evidence")}
                value={files.map((f) => f.name).join("\n") || undefined}
                onEdit={() => setStep(4)}
                editLabel={t("steps.review.edit")}
                empty={t("steps.review.notGiven")}
                multiline
              />
            </dl>

            {removedKinds.length > 0 && (
              <Alert>
                <ShieldCheck aria-hidden />
                <AlertDescription className="text-base">
                  {t("steps.review.removedWarning", {
                    items: removedKinds.map((k) => tx(`removed.${k}`)).join(", "),
                  })}
                </AlertDescription>
              </Alert>
            )}

            {submitError && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden />
                <AlertDescription className="text-base">{err(submitError)}</AlertDescription>
              </Alert>
            )}

            {signedIn === false ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("steps.review.signInHint")}</p>
                <Button
                  type="button"
                  size="lg"
                  className="h-12 w-full text-base"
                  onClick={goToLogin}
                >
                  {t("steps.review.signInToSubmit")}
                </Button>
              </div>
            ) : (
              <>
                <Turnstile ref={botRef} action="report" onToken={bot.onToken} />
                <Button
                  type="button"
                  size="lg"
                  className="h-12 w-full text-base"
                  disabled={submitting || signedIn === null || !bot.ready}
                  onClick={onSubmit}
                >
                  {submitting && <Loader2 className="animate-spin" aria-hidden />}
                  {uploading
                    ? t("steps.review.uploading", {
                        current: String(uploading.current),
                        total: String(uploading.total),
                      })
                    : submitting
                      ? t("steps.review.submitting")
                      : t("steps.review.submit")}
                </Button>
              </>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 flex-1 text-base"
              onClick={back}
              disabled={submitting}
            >
              <ChevronLeft aria-hidden />
              {t("back")}
            </Button>
          )}
          {step < REVIEW && (
            <Button type="submit" size="lg" className="h-12 flex-1 text-base" disabled={!!hashing}>
              {t("next")}
              <ChevronRight aria-hidden />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  onEdit,
  editLabel,
  empty,
  multiline,
}: {
  label: string;
  value?: string;
  onEdit: () => void;
  editLabel: string;
  empty: string;
  multiline?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className={multiline ? "whitespace-pre-line break-words" : "break-words"}>
          {value ?? <span className="text-muted-foreground">{empty}</span>}
        </dd>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="h-11 shrink-0 px-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {editLabel}
      </button>
    </div>
  );
}
