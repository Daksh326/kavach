"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { emailSchema } from "@/lib/validation/auth";
import { Turnstile, useTurnstile } from "@/components/security/turnstile";
import { sendOtp, signInWithGoogle, verifyOtp } from "./actions";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const t = useTranslations("auth");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>(initialError);
  const [pending, startTransition] = useTransition();
  const [bot, botRef] = useTurnstile();

  const form = useForm<{ email: string }>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const onSendCode = form.handleSubmit((values) => {
    setError(undefined);
    startTransition(async () => {
      const res = await sendOtp(values, { turnstileToken: bot.token });
      bot.reset(); // single-use token
      if (!res.ok) return setError(res.error);
      setEmail(res.data.email);
      setCode("");
      setStep("code");
    });
  });

  const onVerify = (token: string) => {
    if (!/^\d{6}$/.test(token)) return setError("invalidCode");
    setError(undefined);
    startTransition(async () => {
      // On success the action redirects; we only get a value back on failure.
      const res = await verifyOtp({ email, token, next });
      if (res && !res.ok) {
        setError(res.error);
        // Clear so the next entry (typed or pasted) re-triggers onComplete.
        setCode("");
      }
    });
  };

  const onGoogle = () => {
    setError(undefined);
    startTransition(async () => {
      const res = await signInWithGoogle({ next });
      if (res && !res.ok) setError(res.error);
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive" aria-live="assertive">
          <AlertCircle aria-hidden />
          {/* Any key with a message in auth.errors is shown; unknown keys fall back. */}
          <AlertDescription>
            {(t as unknown as (k: string) => string)(
              `errors.${t.has(`errors.${error}` as never) ? error : "serviceUnavailable"}`,
            )}
          </AlertDescription>
        </Alert>
      )}

      {step === "email" ? (
        <form onSubmit={onSendCode} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-base">
              {t("emailLabel")}
            </Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              className="h-12 text-base"
              aria-invalid={!!form.formState.errors.email}
              aria-describedby={form.formState.errors.email ? "email-error" : undefined}
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p id="email-error" className="text-sm text-destructive">
                {t("errors.invalidEmail")}
              </p>
            )}
          </div>
          <Turnstile ref={botRef} action="login" onToken={bot.onToken} />
          <Button
            type="submit"
            size="lg"
            className="h-12 w-full text-base"
            disabled={pending || !bot.ready}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? t("sending") : t("sendCode")}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onVerify(code);
          }}
          className="space-y-4"
        >
          <p className="text-base" aria-live="polite">
            {t("codeSentTo", { email })}
          </p>
          <div className="space-y-2">
            <Label htmlFor="otp" className="text-base">
              {t("codeLabel")}
            </Label>
            <InputOTP
              id="otp"
              maxLength={6}
              value={code}
              onChange={setCode}
              onComplete={onVerify}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="^[0-9]*$"
              disabled={pending}
              autoFocus
            >
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, i) => (
                  <InputOTPSlot key={i} index={i} className="size-12 text-xl" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <p className="text-sm text-muted-foreground">{t("neverShare")}</p>
          <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? t("verifying") : t("verify")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full"
            onClick={() => {
              setStep("email");
              setError(undefined);
            }}
          >
            {t("changeEmail")}
          </Button>
        </form>
      )}

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-12 w-full text-base"
        onClick={onGoogle}
        disabled={pending}
      >
        {t("google")}
      </Button>
    </div>
  );
}
