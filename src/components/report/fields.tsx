import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const selectClass =
  "h-12 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

/**
 * A big, tappable radio option (min 48px). Styled with a sibling (`peer`)
 * selector rather than :has(), which is costly to recalculate on low-end phones.
 */
export function RadioCard({
  label,
  className,
  ...props
}: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("relative block cursor-pointer", className)}>
      <input type="radio" className="peer absolute left-4 top-1/2 size-5 -translate-y-1/2 accent-[var(--primary)]" {...props} />
      <span className="flex min-h-12 items-center rounded-lg border bg-card py-2 pl-12 pr-4 text-base peer-checked:border-primary peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
        {label}
      </span>
    </label>
  );
}
