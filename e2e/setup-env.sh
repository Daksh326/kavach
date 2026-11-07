#!/bin/sh
# Writes .env.local and .dev.vars for the end-to-end tests: the local Supabase
# keys (from `supabase status`) plus the stand-in settings in e2e/env.e2e.example.
# Overwrites both files. Requires a running local Supabase (pnpm db:start).
set -e
cd "$(dirname "$0")/.."
STATUS=$(pnpm exec supabase status -o env 2>/dev/null)
val() { echo "$STATUS" | grep "^$1=" | head -1 | cut -d= -f2- | tr -d '"'; }
PUB=$(val PUBLISHABLE_KEY); SECRET=$(val SECRET_KEY); API=$(val API_URL)
[ -n "$PUB" ] && [ -n "$SECRET" ] || { echo "Could not read Supabase keys. Is 'pnpm db:start' running?"; exit 1; }
{
  echo "NEXT_PUBLIC_SITE_URL=http://localhost:3000"
  echo "NEXT_PUBLIC_SUPABASE_URL=${API:-http://127.0.0.1:54321}"
  echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUB"
  echo "SUPABASE_SECRET_KEY=$SECRET"
  grep -v '^#' e2e/env.e2e.example | grep .
} > .env.local
{
  echo "NEXTJS_ENV=development"
  echo "SUPABASE_SECRET_KEY=$SECRET"
  grep -v '^#' e2e/env.e2e.example | grep . | grep -v '^NEXT_PUBLIC_'
} > .dev.vars
echo "Wrote .env.local and .dev.vars for end-to-end tests."
