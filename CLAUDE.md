# Kavach — scam reporting & lookup for India

@AGENTS.md

Victim-first, mobile-first PWA. People who were scammed (or got a suspicious
call/SMS/payment request) get emergency steps, can check a phone/UPI/URL/email
against other users' reports, get an AI scam assessment, and generate
complaint text for official channels. We never submit to government systems.

## Stack (fixed — ask before changing)
Next.js 16 App Router (TS strict, Server Actions) · Tailwind v4 + shadcn/ui
(new-york) + lucide · Cloudflare Workers via @opennextjs/cloudflare + Wrangler ·
Supabase (Postgres, Auth: email OTP + Google, RLS everywhere) · Cloudflare R2
(evidence) · Gemini Flash behind `analyseScam()` · Turnstile · Upstash
ratelimit · Zod · React Hook Form · next-intl (en, hi) · @react-pdf/renderer ·
Resend · Sentry · PostHog (no PII) · Cron Triggers · Vitest + Playwright · pg_trgm.

## Commands
```
pnpm dev                 # next dev on :3000 (needs `pnpm db:start` first)
pnpm check               # typecheck (next typegen + tsc) + eslint
pnpm test                # Vitest unit tests (src/**/*.test.ts)
pnpm build               # next build (Node) — quick sanity check
pnpm cf:preview          # build for Workers + run in workerd on :8787  <- the real target
pnpm cf:deploy           # build + deploy to Cloudflare
pnpm cf:typegen          # regenerate cloudflare-env.d.ts after editing wrangler.jsonc
pnpm db:start | db:stop  # local Supabase (Docker). Mailpit (OTP emails): http://127.0.0.1:54324
pnpm db:reset            # re-apply all migrations + supabase/seed.sql
pnpm db:test             # pgTAP RLS tests in supabase/tests
pnpm db:new <name>       # new migration file
pnpm db:types            # regenerate src/lib/supabase/database.types.ts (local DB)
```
Always verify runtime behaviour with `pnpm cf:preview`, not just `next start`:
OpenNext/workerd behaves differently (see Platform gotchas).

## Layout
```
src/proxy.ts                    Next 16 "proxy" (ex-middleware): locale redirect, auth gate, session refresh
src/i18n/                       next-intl routing/navigation/request config
messages/{en,hi}.json           ALL user-facing strings. Keys must match in both files.
src/app/[locale]/...            Pages. Every page calls setRequestLocale(locale).
src/app/auth/callback/route.ts  OAuth PKCE callback (outside [locale])
src/app/api/cron/daily/         Daily job, called by custom-worker.ts scheduled()
src/lib/env/{public,server}.ts  Zod-validated env. server.ts is `server-only`.
src/lib/supabase/               client.ts (browser), server.ts (user, RLS), admin.ts (service role),
                                public.ts (stateless anon, for public read RPCs), proxy.ts
src/lib/auth/dal.ts             getCurrentUser / requireUser / getCurrentProfile — the only auth source of truth
src/lib/validation/             Zod schemas shared by forms and Server Actions
src/lib/identifiers/            normalize.ts (phone/UPI/URL/email/social/IFSC -> DB form, input detection),
                                shared-domains.ts (platforms never recorded as a "domain"), lookup.ts (public RPCs)
src/components/check/           /check search form (GET, works without JS) + result rendering
src/components/emergency/       checklist island (ticks in localStorage only)
src/components/ui/              shadcn components (generated; edit sparingly)
supabase/migrations/            SQL migrations (schema, functions, RLS)
supabase/seed.sql               Local-only fake data
supabase/tests/*.test.sql       pgTAP tests
custom-worker.ts                Worker entry: OpenNext fetch + Cron scheduled()
```

## Conventions
- **Server Actions**: `"use server"` file next to the page (`actions.ts`). First
  line of every action: `schema.safeParse(input)` (Zod). Return
  `ActionResult` (`src/lib/action-result.ts`); `error` is an i18n key under the
  feature's `errors` namespace, never a raw upstream message. `redirect()` goes
  outside try/catch.
- **Every** API route and Server Action validates input with Zod. Forms use
  React Hook Form + `zodResolver` with the same schema.
- **Auth**: read the user only through `src/lib/auth/dal.ts`. Protected pages
  call `requireUser(path)`. Add protected route prefixes to `PROTECTED_PREFIXES`
  in `src/proxy.ts` too (fast redirect; the DAL is the real check).
- **Supabase clients**: `server.ts` (acts as the user, RLS applies) by default.
  `admin.ts` (service role, bypasses RLS) only in Server Actions/route handlers,
  only after verifying the caller, and only for the service-only RPCs.
- **Public writes go through the server**: `submit_report`, `flag_identifier`,
  `cron_heartbeat` are EXECUTE-able by `service_role` only, so Turnstile + rate
  limits in Server Actions can't be bypassed by calling PostgREST directly with
  the public key. Keep it that way for any new write RPC.
- **i18n**: no hard-coded user-facing strings. Use `getTranslations` (server) /
  `useTranslations` (client). Use `Link`/`redirect`/`useRouter` from
  `@/i18n/navigation`, not `next/link`/`next/navigation`. Plain-language Hindi.
- **Mobile/perf**: system fonts only (no web fonts), min 44px tap targets
  (`h-11`/`h-12`), keep client JS small; prefer Server Components. Public pages
  must stay statically prerendered — don't read cookies/headers in them; put
  session-dependent UI behind a client island or on a dynamic route.
- **Styling**: Tailwind tokens from `globals.css` (`bg-primary`,
  `text-destructive`...). Dark mode follows the OS (`prefers-color-scheme`).
- **Adding shadcn components**: `pnpm dlx shadcn@latest add <name>` (works on
  a normal network; this repo's components were fetched from the registry source).
- **Identifiers**: ALWAYS normalise through `src/lib/identifiers/normalize.ts`
  before storing or looking up (DB check constraints mirror its output). URLs
  are stored as `https://host/path` (no www/query/fragment, path case kept)
  plus the registrable domain, unless the domain is in `SHARED_DOMAINS`.
- **Dynamic translation keys** (e.g. `steps.${id}.title`): cast `t` to
  `(key: string) => string`; `src/i18n/messages.test.ts` guarantees en/hi key
  parity, matching ICU args, and a label for every DB enum value.
- **Lookup results**: always show "not verified" wording; "No reports found"
  must never read as "safe". Pages showing a specific identifier are noindex.
- **Formatting**: Prettier (`pnpm format`), printWidth 100.

## Database rules
- Migrations only (`pnpm db:new`), never edit the remote DB by hand. After a
  schema change: `pnpm db:reset && pnpm db:test && pnpm db:types`.
- RLS enabled on every table. Grants are explicit: migration 0003 revokes all
  from anon/authenticated then grants back the minimum; new tables/functions
  are NOT exposed by default (default privileges revoked). Grant deliberately.
- SECURITY DEFINER functions: `set search_path = ''`, fully-qualified names,
  explicit `auth.uid()`/`private.is_admin()` checks. Internal helpers live in
  the unexposed `private` schema.
- Public lookup threshold: `private.public_reporter_threshold()` (2 distinct
  users). Below it, `lookup_identifier` returns `is_reported=false` with NO
  counts so a single report is never observable. Hidden/merged handled there.
- Identifier aggregates are maintained by triggers on `report_identifiers`;
  never write `report_count`/`distinct_reporter_count` from app code.
- Evidence row deletion (incl. account-deletion cascade) enqueues the R2 key
  in `r2_deletion_queue`; the daily cron purges R2. Never delete R2 objects
  without also deleting the row, or vice versa.
- `reports.consent_at` is NOT NULL: a report row only exists after explicit
  consent. Unconsented wizard drafts stay on the device.

## Privacy & safety rules (non-negotiable)
- DPDP Act 2023: explicit consent before saving a report; export + delete all
  user data (DB + R2). Evidence is owner-only; short-lived signed URLs only.
- Never store full card numbers, CVV, OTPs, passwords, full bank account
  numbers (only last 4). Strip them from free text before saving.
- Before text goes to Gemini: redact the user's own PII (name, phone, email,
  Aadhaar/PAN patterns, account numbers). Screenshots go to Gemini only on an
  explicit "Analyse this screenshot" tap. Show the AI-processing notice.
- Lookup wording: "reported by users, not verified". Never expose reporters.
- No PII in PostHog events, Sentry breadcrumbs or logs.
- Secrets only in env/Wrangler secrets; never `NEXT_PUBLIC_` a secret.

## Platform gotchas (learned the hard way)
- **No rewrites in the proxy.** On OpenNext, Server Actions on proxy-rewritten
  routes return 500 and `redirect()` after a rewrite is served as an internal
  rewrite. That's why next-intl uses `localePrefix: "always"` (redirect-only).
- `cacheComponents` is OFF: Next documents it as Node-only; we run on workerd.
- Next 16 `proxy.ts` runs on the Node runtime; OpenNext supports it but flags
  it "experimental". Keep the proxy small; if it misbehaves, test in `cf:preview`.
- The proxy skips Supabase entirely when no `sb-` cookie is present (most
  visitors), so public pages cost no auth round-trip.
- NEXT_PUBLIC_* are inlined at BUILD time; server secrets are read at request
  time from Wrangler secrets. The cron handler calls the app over the
  `WORKER_SELF_REFERENCE` binding so job code has normal env access.
- Prerendered pages are served from Workers Static Assets
  (`staticAssetsIncrementalCache`); `opennextjs-cloudflare preview/deploy`
  populates it — plain `wrangler dev` does not.
- `input-otp` fires `onComplete` only when the value grows to full length —
  clear the value after a failed attempt.

## Phase status
1. ✅ Setup: scaffold, OpenNext/Wrangler, Supabase schema + RLS + RPCs + seed +
   pgTAP tests, generated types, auth (email OTP + Google), i18n skeleton.
2. ✅ Emergency page + home + /check lookup (en + hi); Vitest + normalisation tests;
   /analyse placeholder (home box hands text over via sessionStorage "kavach:analyse-draft")
3. ⏳ Report wizard + R2 evidence + dashboard + complaint text/PDF
4. ⏳ /analyse with Gemini behind `analyseScam()` + PII redaction
5. ⏳ Admin moderation, flags, Turnstile, rate limits, PWA/offline, Sentry, PostHog, cron jobs
6. ⏳ Vitest/Playwright suites, deploy, full README
