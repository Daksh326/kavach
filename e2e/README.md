# End-to-end tests

Four browser suites (Playwright) that drive the **built Cloudflare Worker**
(`pnpm cf:preview`, not `next dev`) the way a user would. Every external
service runs as a local stand-in, so no accounts or network access are needed.

| Suite | Covers | Checks |
|---|---|---|
| `phase2.cjs` | home, emergency checklist, `/check` lookups (en + hi), no horizontal scroll at 360px | 29 |
| `phase3.cjs` | report wizard (signed out → sign-in → submit), evidence upload/download, complaint text, PDF, status, export, delete report, delete account | 46 |
| `phase4.cjs` | AI checker: redaction before the AI, caching, errors, screenshots, "Report this" | 38 |
| `phase5.cjs` | Turnstile, flags, admin moderation + merge, daily job, Sentry/PostHog privacy, offline mode, rate limits | 38 |

## One-time setup

You need Docker (already used for Supabase), Node 22 and Python 3.

1. Browser for Playwright:

   ```bash
   pnpm dlx playwright@1 install chromium
   ```

2. Redis plus an Upstash-compatible REST endpoint:

   ```bash
   docker network create kavach-rl
   ```

   ```bash
   docker run -d --name kavach-redis --network kavach-rl redis:8-alpine
   ```

   ```bash
   docker run -d --name kavach-srh --network kavach-rl -p 127.0.0.1:8079:80 -e SRH_MODE=env -e SRH_TOKEN=local-upstash-token -e SRH_CONNECTION_STRING=redis://kavach-redis:6379 hiett/serverless-redis-http:latest
   ```

3. S3 emulator standing in for R2:

   ```bash
   python3 -m pip install "moto[server]"
   ```

4. Append `e2e/env.e2e.example` to both `.env.local` and `.dev.vars`
   (remove any earlier lines with the same names).

## Each run

Start these in separate terminals and leave them running:

```bash
pnpm db:start
```

```bash
moto_server -H 127.0.0.1 -p 9100
```

```bash
node e2e/fakes/fake-gemini.cjs
```

```bash
node e2e/fakes/fake-services.cjs
```

```bash
node scripts/dev/upstash-shim.mjs
```

```bash
pnpm cf:preview
```

Create the emulator bucket once per moto start:

```bash
R2_CHECK_CREATE_BUCKET=1 pnpm storage:check
```

Then run all suites (or name some, e.g. `pnpm e2e phase2 phase4`):

```bash
pnpm e2e
```

Screenshots and downloaded files land in `e2e/output/` (git-ignored).

## Notes

- Each suite starts from a fresh `pnpm db:reset`, which `pnpm e2e` does for you.
- Restart `pnpm cf:preview` before re-running `phase5`: it deliberately hits
  rate limits, and the running worker remembers blocked keys in memory.
- The fakes record what they receive (`GET http://127.0.0.1:9200/__state`,
  `GET http://127.0.0.1:9300/__state`), which is how the suites prove, for
  example, that an OTP never reached the AI.
- What the fakes can't prove (signed-URL acceptance and tamper rejection by
  real R2, the real Gemini model, the real Turnstile widget) is covered by
  `pnpm storage:check`, `pnpm ai:check` and the checks in README section 2.6.
