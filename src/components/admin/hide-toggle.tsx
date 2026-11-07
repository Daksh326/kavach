"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { setHidden } from "@/app/[locale]/admin/actions";

export function HideToggle({ identifierId, hidden }: { identifierId: string; hidden: boolean }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={hidden ? "outline" : "destructive"}
        className="h-11"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setHidden({ identifierId, hidden: !hidden });
            if (res.ok) router.refresh();
            else setFailed(true);
          })
        }
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {hidden ? t("unhide") : t("hide")}
      </Button>
      {failed && <span className="text-sm text-destructive">{t("actionFailed")}</span>}
    </div>
  );
}
