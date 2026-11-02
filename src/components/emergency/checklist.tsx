"use client";

import {
  createContext,
  use,
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "kavach:emergency-checklist:v1";

type Ctx = { done: ReadonlySet<string>; toggle: (id: string) => void; total: number };
const ChecklistContext = createContext<Ctx | null>(null);

// localStorage as an external store: hydrates with no ticks (server snapshot),
// then shows saved ticks, and stays in sync across tabs.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

const getServerSnapshot = () => "[]";

function parse(raw: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Ticks are saved on this device only (localStorage); nothing is sent anywhere. */
export function ChecklistProvider({ total, children }: { total: number; children: ReactNode }) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const done = useMemo(() => parse(raw), [raw]);

  const toggle = useCallback((id: string) => {
    const next = parse(getSnapshot());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // Private mode / storage disabled: ticks just won't persist.
    }
    listeners.forEach((l) => l());
  }, []);

  const value = useMemo(() => ({ done, toggle, total }), [done, toggle, total]);
  return <ChecklistContext value={value}>{children}</ChecklistContext>;
}

function useChecklist() {
  const ctx = use(ChecklistContext);
  if (!ctx) throw new Error("useChecklist must be used inside ChecklistProvider");
  return ctx;
}

export function StepToggle({ id, label }: { id: string; label: string }) {
  const { done, toggle } = useChecklist();
  const checked = done.has(id);
  return (
    <label
      className={cn(
        "inline-flex h-11 cursor-pointer select-none items-center gap-2 rounded-lg border px-4 text-sm font-medium",
        checked ? "border-success bg-success/10 text-success" : "bg-background",
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={() => toggle(id)}
      />
      <span
        aria-hidden
        className={cn(
          "flex size-5 items-center justify-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
          checked ? "border-success bg-success text-white" : "border-input",
        )}
      >
        {checked && <Check className="size-4" />}
      </span>
      {label}
    </label>
  );
}

/** The marker on each step card: a number, or a tick once done. */
export function StepMarker({ id, number }: { id: string; number: number }) {
  const { done } = useChecklist();
  const checked = done.has(id);
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-base font-bold",
        checked ? "bg-success text-white" : "bg-primary text-primary-foreground",
      )}
    >
      {checked ? <Check className="size-5" /> : number}
    </span>
  );
}

export function ChecklistProgress({ template }: { template: string }) {
  const { done, total } = useChecklist();
  const count = Math.min(done.size, total);
  return (
    <div aria-live="polite" className="space-y-1">
      <p className="text-sm font-medium">
        {template.replace("{done}", String(count)).replace("{total}", String(total))}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-success transition-[width]"
          style={{ width: `${(count / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
