"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { resolveFlag } from "@/app/[locale]/admin/actions";

export function FlagActions({ flagId }: { flagId: string }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const act = (action: "dismiss" | "hide") =>
    start(async () => {
      const res = await resolveFlag({ flagId, action });
      if (res.ok) router.refresh();
      else setFailed(true);
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="destructive"
        className="h-11"
        disabled={pending}
        onClick={() => act("hide")}
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {t("hideEntry")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        disabled={pending}
        onClick={() => act("dismiss")}
      >
        {t("dismissFlag")}
      </Button>
      {failed && <span className="text-sm text-destructive">{t("actionFailed")}</span>}
    </div>
  );
}
