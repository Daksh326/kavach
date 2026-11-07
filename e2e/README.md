# End-to-end tests (Playwright)

Four suites that drive the **built Cloudflare Worker** the way a user would, with
local stand-ins for every external service, so no accounts or network access
are needed. They also run in GitHub Actions on every push (`.github/workflows/ci.yml`).

| File | Covers |
|---|---|
| `tests/01-lookup.spec.cjs` | home, emergency checklist, `/check` lookups (en + hi), no sideways scroll at 360px |
| `tests/02-report.spec.cjs` | report wizard (signed out → sign-in → submit), evidence upload/download, complaint text, PDF, status, export, deleting a report and an account |
| `tests/03-analyse.spec.cjs` | AI checker: redaction before the AI, cache, errors, screenshots, "Report this" |
| `tests/04-safety.spec.cjs` | Turnstile, flags, admin moderation + merge, daily job, Sentry/PostHog privacy, offline mode, rate limits |

Each suite is one Playwright test made of many named checks (soft assertions):
every failed check is listed in the report and the suite keeps going.

## One-time setup

Docker (already used for Supabase), Node 22, Python 3. Mac/Linux shell, or Git Bash/WSL on Windows.

```bash
pnpm exec playwright install chromium
```

```bash
python3 -m pip install "moto[server]"
```

## Each run

```bash
pnpm db:start
```

```bash
sh e2e/start-redis.sh
```

`setup-env.sh` **overwrites** `.env.local` and `.dev.vars` with test settings
(local Supabase keys plus every stand-in). Back them up first if you changed them.

```bash
sh e2e/setup-env.sh
```

```bash
pnpm cf:build
```

```bash
pnpm e2e
```

Playwright starts the stand-ins (`e2e/fakes/`), the S3 emulator, the Upstash
shim and the Worker preview, and stops them at the end. Don't run
`pnpm cf:preview` yourself at the same time: if port 8787 is already taken,
Playwright reuses that server, and a long-running worker remembers rate-limit
blocks from earlier runs. To see the HTML report:

```bash
pnpm e2e:report
```

Run one suite with `pnpm e2e 03-analyse`. If `moto_server` isn't on your PATH,
set `MOTO_SERVER=/path/to/moto_server`.

## What the stand-ins can't prove

Signed-URL acceptance and tamper rejection by real R2, the real Gemini model and
the real Turnstile widget. Those are covered by `pnpm storage:check`,
`pnpm ai:check` and the checks in README section 2.6.
