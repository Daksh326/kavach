import Form from "next/form";
import { Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Plain GET form: works with no JavaScript (slow 3G, old phones), and
 * next/form upgrades it to client-side navigation when JS is ready.
 */
export async function CheckForm({
  defaultValue = "",
  autoFocus = false,
}: {
  defaultValue?: string;
  autoFocus?: boolean;
}) {
  const [t, locale] = await Promise.all([getTranslations("check"), getLocale()]);
  return (
    <Form action={`/${locale}/check`} className="space-y-2" role="search">
      <label htmlFor="check-q" className="sr-only">
        {t("label")}
      </label>
      <div className="flex gap-2">
        <Input
          id="check-q"
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder={t("placeholder")}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={600}
          autoFocus={autoFocus}
          className="h-12 min-w-0 flex-1 text-base"
        />
        <Button type="submit" size="lg" className="h-12 shrink-0 px-5 text-base">
          <Search aria-hidden />
          {t("button")}
        </Button>
      </div>
    </Form>
  );
}
