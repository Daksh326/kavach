# Kavach

Victim-first scam help for India: emergency steps, lookup of reported phone
numbers / UPI IDs / links, AI scam check, and complaint text generation.

> Status: **Phase 2** (emergency steps, home, number/UPI/link lookup). See `CLAUDE.md` for architecture
> and conventions. This README grows with each phase.

---

## 1. Local development (no accounts needed)

Prerequisites: **Node 22 LTS** (20.9+ works), **pnpm 10** (`corepack enable`),
**Docker** (Docker Desktop on macOS/Windows) for the local Supabase stack.

```bash
pnpm install
```

```bash
pnpm db:start
```

`db:start` prints `API_URL`, `PUBLISHABLE_KEY` and `SECRET_KEY`. Copy the env
template and paste those three values in:

```bash
cp .env.example .env.local
```

```bash
openssl rand -hex 32
```

Put that value in `CRON_SECRET`. Then load the schema and fake data, and start the app:

```bash
pnpm db:reset
```

```bash
pnpm dev
```

Open http://localhost:3000 and sign in with a seeded user, e.g.
`asha@kavach.test` (or `admin@kavach.test` for the admin role). The 6-digit
code arrives in **Mailpit** at http://127.0.0.1:54324.

Seeded users: `admin@`, `asha@`, `ravi@`, `meera@`, `john@`, `priya@` — all `@kavach.test`.

### Checks

```bash
pnpm check
```

```bash
pnpm test
```

```bash
pnpm db:test
```

`test` runs the Vitest unit tests (identifier normalisation, translation
catalogs). `db:test` runs the pgTAP RLS suite (26 tests) against the local database.

### Try Phase 2

- http://localhost:3000/en/emergency (tick steps off; ticks are remembered on the device)
- http://localhost:3000/en/check, then try these seeded examples:
  - `60000 00101` (reported by 3 people)
  - `earn.daily.tasks@fakepsp` (reported by 2)
  - `https://kyc-update-portal.test/verify` (website reported, exact link not)
  - `kyc-update-portl.test` (typo: shows the similar reported site)
  - `6000000202` (one person reported it twice, so it stays "No reports found")
  - `wa.me/916000000101` (phone pulled out of a WhatsApp link)

### Run on the real Cloudflare runtime locally

`next dev` runs on Node; production runs on Cloudflare's `workerd`, which
behaves differently in places. Before calling something done, test it here:

```bash
cp .dev.vars.example .dev.vars
```

Fill in `SUPABASE_SECRET_KEY` and `CRON_SECRET` (same values as `.env.local`), then:

```bash
pnpm cf:preview
```

App on http://localhost:8787. Trigger the daily cron job by hand:

```bash
curl -X POST -H "authorization: Bearer $CRON_SECRET" http://localhost:8787/api/cron/daily
```

### Local Google sign-in (optional)

Create a Google OAuth client (step 2.3) with redirect URI
`http://127.0.0.1:54321/auth/v1/callback`, export
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`,
set `enabled = true` under `[auth.external.google]` in `supabase/config.toml`,
then `pnpm db:stop && pnpm db:start`.

---

## 2. Hosted setup (free tiers)

### Accounts

| Service | Needed from | Free tier notes |
|---|---|---|
| GitHub | now | Code hosting |
| Supabase | Phase 1 | 2 free projects; **pauses after 7 days idle** (the daily cron prevents this) |
| Cloudflare | Phase 1 | Workers Free: 100k requests/day, 3 MiB compressed worker. R2: 10 GB free. Turnstile free |
| Google Cloud | Phase 1 | OAuth client for "Sign in with Google" (free) |
| Resend | **before real users sign in** | 3,000 emails/month, 100/day. Supabase's built-in email only delivers to your project's team members, so real users need custom SMTP |
| Google AI Studio | Phase 4 | Gemini free tier (content may be used by Google to improve products, hence our PII redaction) |
| Upstash | Phase 5 | Redis free tier |
| Sentry | Phase 5 | Developer plan |
| PostHog | Phase 5 | 1M events/month |

### 2.1 Supabase

1. Create a project at https://supabase.com/dashboard. Pick region **South Asia (Mumbai)**.
   Save the database password.
2. Link and push the schema (asks for the DB password):

   ```bash
   pnpm exec supabase login
   ```

   ```bash
   pnpm exec supabase link --project-ref <your-project-ref>
   ```

   ```bash
   pnpm db:push
   ```

   `db:push` applies migrations only; the fake seed data is **not** pushed.

3. **Project Settings → API Keys**: copy the publishable key (`sb_publishable_…`)
   and a secret key (`sb_secret_…`). Use the new keys, not the legacy anon/service_role JWTs.
4. **Project Settings → JWT Keys**: make sure asymmetric signing keys are active
   (default on new projects). Our session checks then verify tokens locally
   instead of calling the Auth server.
5. **Authentication → URL Configuration**:
   - Site URL: `https://<your-worker>.workers.dev` (or your domain)
   - Redirect URLs: `https://<your-worker>.workers.dev/auth/callback`
6. **Authentication → Emails → Templates**: for **Magic Link** and **Confirm signup**,
   set subject `Your Kavach sign-in code` and paste the body from
   `supabase/templates/otp.html` (it shows the 6-digit `{{ .Token }}` code).
   Set the email OTP expiry to 600 seconds (Authentication → Providers → Email).
7. **Authentication → Emails → SMTP** (before real users): enable custom SMTP with
   Resend (`smtp.resend.com`, port 465, user `resend`, password = Resend API key,
   sender on a domain you verified in Resend).
8. Make yourself admin after your first sign-in (SQL Editor):

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

### 2.2 Cloudflare

```bash
pnpm wrangler login
```

```bash
pnpm wrangler r2 bucket create kavach-evidence
```

Keep the bucket **private** (no public access, no r2.dev URL). Phase 3 adds the
R2 API token and CORS steps.

### 2.3 Google OAuth

1. Google Cloud Console → APIs & Services → OAuth consent screen: External, app name "Kavach".
2. Credentials → Create OAuth client ID → Web application.
   Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → Authentication → Providers → Google: paste the client ID and secret, enable.

### 2.4 Configure and deploy

Public values are baked in at build time. Create `.env.production`
(git-ignored) with:

```
NEXT_PUBLIC_SITE_URL=https://<your-worker>.workers.dev
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Server secrets go into Wrangler (each command prompts for the value):

```bash
pnpm wrangler secret put SUPABASE_SECRET_KEY
```

```bash
pnpm wrangler secret put CRON_SECRET
```

Deploy:

```bash
pnpm cf:deploy
```

The first deploy prints your `*.workers.dev` URL. If it differs from what you
put in `NEXT_PUBLIC_SITE_URL` / Supabase URL configuration, update both and
deploy again.

---

## Environment variables

See `.env.example` for the full annotated list. Rule of thumb:
`NEXT_PUBLIC_*` → `.env.local` / `.env.production` (build time, visible to
browsers); everything else → `wrangler secret put` (runtime, server only).
