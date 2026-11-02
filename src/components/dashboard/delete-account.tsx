"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/report/fields";
import { deleteMyAccount } from "@/app/[locale]/dashboard/actions";

export function DeleteAccount() {
  const t = useTranslations("dashboard");
  const word = t("deleteWord");
  const [typed, setTyped] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  return (
    <section className="space-y-3 rounded-xl border border-destructive/40 p-4">
      <h3 className="font-bold">{t("deleteTitle")}</h3>
      <p className="text-sm text-muted-foreground">{t("deleteBody")}</p>
      <label htmlFor="confirm-delete" className="block text-sm font-medium">
        {t("deleteTypeToConfirm", { word })}
      </label>
      <Input
        id="confirm-delete"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoCapitalize="characters"
        autoComplete="off"
        className="h-12 text-base"
      />
      <Button
        type="button"
        variant="destructive"
        className="h-12 w-full text-base"
        disabled={typed.trim().toUpperCase() !== word || pending}
        onClick={() =>
          start(async () => {
            setFailed(false);
            const res = await deleteMyAccount({ confirm: "DELETE" });
            if (res && !res.ok) setFailed(true);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
        {pending ? t("deleting") : t("deleteButton")}
      </Button>
      {failed && <FieldError>{t("deleteFailed")}</FieldError>}
    </section>
  );
}
