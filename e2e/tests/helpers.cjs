// Shared helpers for the end-to-end suites (plain CommonJS, like the fakes).
const { execFileSync, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8787';
const MAIL = 'http://127.0.0.1:54324';
const FAKE_GEMINI = 'http://127.0.0.1:9200';
const FAKE_SERVICES = 'http://127.0.0.1:9300';
const DIR = path.join(__dirname, '..', 'output');
fs.mkdirSync(DIR, { recursive: true });

/** One named check. Soft: a failure is reported and the suite keeps going. */
const check = (name, cond, extra = '') => expect.soft(!!cond, extra ? `${name} (${extra})` : name).toBe(true);

/** SQL against the local Supabase DB through its container (no psql install needed). */
const psql = (q) =>
  execFileSync('docker', ['exec', 'supabase_db_kavach', 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A', '-c', q])
    .toString()
    .trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fresh seed data, empty Redis, reset fakes. Called at the start of every suite. */
async function resetState() {
  execSync('pnpm db:reset', { stdio: 'ignore' });
  try {
    execFileSync('docker', ['exec', 'kavach-redis', 'redis-cli', 'FLUSHALL'], { stdio: 'ignore' });
  } catch {
    // Redis is only needed by the abuse-protection suite.
  }
  await Promise.all(
    [`${FAKE_GEMINI}/__reset`, `${FAKE_SERVICES}/__reset`, `${MAIL}/api/v1/messages`].map((u, i) =>
      fetch(u, { method: i === 2 ? 'DELETE' : 'POST' }).catch(() => {}),
    ),
  );
}

/** Latest 6-digit sign-in code sent to an address (local Mailpit). */
async function otpCode(email) {
  for (let i = 0; i < 30; i++) {
    const l = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent('to:' + email)}`)).json();
    if (l.messages?.[0]) {
      const m = await (await fetch(`${MAIL}/api/v1/message/${l.messages[0].ID}`)).json();
      const c = (m.Text || '').match(/\b(\d{6})\b/);
      if (c) return c[1];
    }
    await sleep(400);
  }
  throw new Error(`no sign-in code for ${email}`);
}

module.exports = { BASE, MAIL, FAKE_GEMINI, FAKE_SERVICES, DIR, check, psql, sleep, resetState, otpCode };
