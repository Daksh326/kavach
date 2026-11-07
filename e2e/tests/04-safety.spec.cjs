// Converted from the phase scripts used during development. Each check() is a soft
// assertion: failures are all reported and the flow continues.
const { test } = require('@playwright/test');
const { BASE, MAIL, FAKE_GEMINI, FAKE_SERVICES, DIR, check, psql, sleep, resetState, otpCode } = require('./helpers.cjs');
const { execFileSync, execSync } = require('node:child_process');
const FAKE = FAKE_SERVICES;
const CRON = 'local-dev-cron-secret-0123456789abcdef';
const state = async () => (await fetch(`${FAKE}/__state`)).json();
const lookupPublic = (type, value) => psql(`select is_reported from lookup_identifier('${type}','${value}')`) === 't';

const code = otpCode;
async function signIn(page, email) {
  await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE' });
  await page.goto(`${BASE}/en/login`);
  await page.fill('#email', email);
  await page.waitForSelector('form button[type=submit]:not([disabled])'); // waits for the Turnstile token
  await page.click('form button[type=submit]');
  await page.waitForSelector('#otp');
  await page.locator('#otp').fill(await code(email));
  await page.waitForURL((u) => u.pathname === '/en/dashboard', { timeout: 15000 });
}

test.describe.configure({ mode: 'serial' });

test('Phase 5: Turnstile, flags, admin, cron, monitoring, offline, rate limits', async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  await resetState();

  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!e.message.includes('client boom')) errors.push(e.message); }); // that one is thrown on purpose

  // ================= Turnstile =================
  await page.goto(`${BASE}/en/analyse`);
  await page.waitForSelector('#analyse-text');
  await page.fill('#analyse-text', 'Your SBI KYC has expired, update now at http://sbi-kyc.test');
  const submit = page.locator('form button[type=submit]');
  await page.waitForSelector('[data-fake-turnstile="analyse"]', { state: 'attached' });
  await page.waitForFunction(() => !document.querySelector('form button[type=submit]').disabled, null, { timeout: 5000 });
  check('Turnstile token enables the submit button', !(await submit.isDisabled()));
  await page.evaluate(() => { window.__turnstileNext = 'fail'; }); // the NEXT token will be invalid
  await submit.click();
  await page.waitForSelector('section[aria-live] h2', { timeout: 30000 });
  let st = await state();
  check('valid token verified server-side (action=analyse)', st.verifies.some((v) => v.ok && v.token.includes('-analyse-')));
  await page.click('button:has-text("Check another message")');
  await page.fill('#analyse-text', 'Second message: your parcel is held at customs, pay fee');
  await page.waitForFunction(() => !document.querySelector('form button[type=submit]').disabled);
  await submit.click();
  await page.waitForSelector('[data-slot=alert]', { timeout: 15000 });
  check('invalid token -> bot-check message, no AI call', (await page.locator('[data-slot=alert]').innerText()).includes("couldn't confirm you're not a bot"));
  check('tokens are single-use (widget reset after each submit)', new Set((await state()).verifies.map((v) => v.token)).size === (await state()).verifies.length);
  await page.evaluate(() => { window.__turnstileNext = 'ok'; });

  // ================= Flags =================
  await page.goto(`${BASE}/en/check?q=6000000101`);
  await page.click('button:has-text("Is this wrong? Flag it")');
  await page.locator('label:has-text("It isn\'t a scam")').click();
  await page.fill('form textarea', 'This is a shop landline, OTP 123456 was mentioned by mistake');
  await page.waitForFunction(() => !document.querySelector('form button[type=submit]')?.disabled);
  await page.click('button:has-text("Send to moderators")');
  await page.waitForSelector('text=A moderator will review this entry.');
  const flagRow = psql(`select f.reason||'|'||coalesce(f.flagged_by::text,'anon')||'|'||f.details from flags f join identifiers i on i.id=f.identifier_id where i.value_normalized='+916000000101' and f.flagged_by is null`);
  check('anonymous flag stored, secrets stripped from details', flagRow.startsWith('wrong_number|anon|') && flagRow.includes('[code removed]') && !flagRow.includes('123456'), flagRow);
  await page.goto(`${BASE}/en/check?q=6000000202`);
  check('no flag option on non-public entries', (await page.locator('button:has-text("Flag it")').count()) === 0);

  // ================= Admin =================
  const resp404 = await page.goto(`${BASE}/en/admin`);
  check('admin redirects signed-out visitors to login', new URL(page.url()).pathname === '/en/login');
  await signIn(page, 'asha@kavach.test');
  const r = await page.goto(`${BASE}/en/admin`);
  check('non-admin gets 404 for /admin', r.status() === 404);
  await ctx.clearCookies();
  await signIn(page, 'admin@kavach.test');
  check('admin sees moderation link on dashboard', await page.locator('a:has-text("Moderation (admin)")').isVisible());
  await page.goto(`${BASE}/en/admin`);
  let txt = await page.locator('main').innerText();
  check('queue lists open flags with reasons', txt.includes('+91 60000 00101') && txt.includes("It isn't a scam") && txt.includes('This is my number or ID'));
  const html = await page.content();
  check('queue never shows who flagged/reported', !html.includes('priya@') && !html.includes('a0000000-0000-4000-8000-000000000006'));
  await page.locator('li:has-text("+91 60000 00101") button:has-text("Hide entry")').first().click();
  await page.waitForSelector('text=No open flags', { timeout: 10000 });
  check('hide: entry disappears from public lookup', !lookupPublic('phone', '+916000000101'));
  check('hide: all open flags on it resolved', psql(`select count(*) from flags f join identifiers i on i.id=f.identifier_id where i.value_normalized='+916000000101' and f.status='open'`) === '0');
  // Identifier detail: unhide + merge
  await page.fill('input[name=q]', '6000000101');
  await page.click('button:has-text("Search")');
  await page.click('main ul a:has-text("+91 60000 00101")');
  await page.waitForURL((u) => u.pathname.startsWith('/en/admin/identifier/'));
  txt = await page.locator('main').innerText();
  check('detail shows what was reported, not by whom', txt.includes('Fake bank / KYC update') && txt.includes('What people reported') && !(await page.content()).includes('asha@'));
  await page.click('button:has-text("Show in public lookup again")');
  await page.waitForSelector('button:has-text("Hide from public lookup")');
  check('unhide: back in public lookup', lookupPublic('phone', '+916000000101'));
  const targetId = new URL(page.url()).pathname.split('/').pop();
  const dupId = psql(`select id from identifiers where value_normalized='+916000000202'`);
  await page.goto(`${BASE}/en/admin/identifier/${dupId}`);
  await page.fill('input[aria-label="Correct value"]', '60000 00101');
  await page.click('button:has-text("Merge")');
  await page.waitForURL((u) => u.pathname.endsWith(targetId), { timeout: 10000 });
  check('merge: lands on the canonical entry', true);
  check('merge: old value now resolves to the canonical entry', lookupPublic('phone', '+916000000202'));
  check('merge: reports moved', psql(`select report_count from identifiers where id='${targetId}'`) === '5', psql(`select report_count from identifiers where id='${targetId}'`));

  // ================= Daily job =================
  psql(`insert into r2_deletion_queue (r2_key) values ('evidence/test/queued-object')`);
  psql(`insert into ai_analyses (user_id, input_hash, model, result_json, created_at) values (null, repeat('a',64), 't', '{}', now() - interval '40 days'), ('a0000000-0000-4000-8000-000000000002', repeat('b',64), 't', '{}', now() - interval '40 days')`);
  const job = await (await fetch(`${BASE}/api/cron/daily`, { method: 'POST', headers: { authorization: `Bearer ${CRON}` } })).json();
  check('daily job ok', job.ok === true && job.heartbeat?.now, JSON.stringify(job).slice(0, 200));
  check('daily job purged R2 deletion queue', psql(`select count(*) from r2_deletion_queue`) === '0' && job.r2Queue?.purged >= 1);
  check('daily job expired anonymous AI cache only', psql(`select count(*) from ai_analyses where input_hash in (repeat('a',64), repeat('b',64))`) === '1' && job.aiCacheDeleted === 1);
  check('cron rejects wrong secret', (await fetch(`${BASE}/api/cron/daily`, { method: 'POST', headers: { authorization: 'Bearer nope' } })).status === 401);

  // ================= Sentry (client) =================
  await fetch(`${FAKE}/__reset`, { method: 'POST' });
  await page.goto(`${BASE}/en/check`);
  await page.evaluate(() => setTimeout(() => { throw new Error('client boom for asha@example.com and 9876543210'); }, 0));
  await sleep(1500);
  st = await state();
  const env = st.envelopes.find((e) => e.project === '1');
  const ev = env ? JSON.parse(env.body.split('\n')[2]) : null;
  check('browser error reported to Sentry', !!ev && ev.platform === 'javascript' && env.auth.includes('sentry_key=publickey'));
  check('Sentry event scrubbed: no email/number, no user', ev && !JSON.stringify(ev).includes('asha@') && !JSON.stringify(ev).includes('9876543210') && !('user' in ev), ev?.exception?.values?.[0]?.value);

  // ================= PostHog =================
  await fetch(`${FAKE}/__reset`, { method: 'POST' });
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/en/check?q=6000000101`);
  await p2.goto(`${BASE}/en/emergency`);
  await p2.locator('#call1930 label').click();
  await sleep(1200);
  st = await state();
  const names = st.events.map((e) => e.event);
  check('pageviews + feature events sent', names.includes('$pageview') && names.includes('check_performed') && names.includes('emergency_step_done'), names.join(','));
  const all = JSON.stringify(st.events);
  check('analytics carry no identifiers or query strings', !all.includes('6000000101') && !all.includes('?q=') && !all.includes('asha@'));
  check('analytics are anonymous (no person profiles)', st.events.every((e) => e.properties.$process_person_profile === false));
  const checkEv = st.events.find((e) => e.event === 'check_performed');
  check('check event has only coarse props', checkEv && checkEv.properties.kind === 'phone' && typeof checkEv.properties.reported === 'boolean');
  await p2.close();
  // Global Privacy Control respected
  await fetch(`${FAKE}/__reset`, { method: 'POST' });
  const gpcCtx = await browser.newContext();
  await gpcCtx.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }));
  const p3 = await gpcCtx.newPage();
  await p3.goto(`${BASE}/en/check?q=6000000101`);
  await sleep(1000);
  check('no analytics when Global Privacy Control is on', (await state()).events.length === 0);
  await gpcCtx.close();

  // ================= PWA / offline =================
  const pwa = await browser.newContext({ viewport: { width: 360, height: 760 } });
  const pp = await pwa.newPage();
  await pp.goto(`${BASE}/en`);
  // waitForFunction does NOT await async predicates (a Promise is truthy), so poll explicitly.
  const until = async (fn, ms = 20000) => {
    for (const t = Date.now(); Date.now() - t < ms; await sleep(300)) if (await pp.evaluate(fn)) return true;
    return false;
  };
  const activated = await until(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
  const pagesCached = await until(async () => {
    const c = await caches.open('kavach-pages-v1');
    return !!(await c.match('/en/emergency')) && !!(await c.match('/hi/emergency'));
  });
  await until(async () => (await (await caches.open('kavach-assets-v1')).keys()).length > 3);
  const assetCount = await pp.evaluate(async () => (await (await caches.open('kavach-assets-v1')).keys()).length);
  check('service worker precached both emergency pages + assets', activated && pagesCached && assetCount > 3, `${assetCount} assets`);
  await pp.reload(); // make the page controlled
  await pwa.setOffline(true);
  await pp.waitForSelector('[role=status]:has-text("offline")', { timeout: 5000 }).catch(() => {});
  check('offline banner appears', await pp.locator('[role=status]:has-text("You\'re offline")').isVisible());
  await pp.goto(`${BASE}/en/emergency`);
  txt = await pp.locator('main').innerText();
  const styled = await pp.evaluate(() => getComputedStyle(document.querySelector('h1')).fontWeight);
  check('emergency page works offline, styled', txt.includes('Call 1930, the national cyber fraud helpline') && Number(styled) >= 700, `weight ${styled}`);
  await pp.locator('#portal label').click();
  check('checklist still interactive offline', (await pp.locator('[aria-live=polite]').first().innerText()).includes('1 of 7'));
  await pp.goto(`${BASE}/hi/check?q=123`);
  check('any page offline -> emergency steps in that language', (await pp.locator('main').innerText()).includes('1930 पर कॉल करें'));
  await pp.screenshot({ path: DIR + '/offline-hi.png' });
  await pwa.setOffline(false);
  await pwa.close();

  // ================= Rate limits =================
  // Analyse: 10 per 10 minutes per actor (2 attempts used above).
  let limited = false;
  // Signed in as admin by now: the limit is per account (10 per 10 minutes), so the 11th is refused.
  let attempts = 0;
  for (let i = 0; i < 12 && !limited; i++) {
    attempts++;
    await page.goto(`${BASE}/en/analyse`);
    await page.waitForSelector('#analyse-text');
    await page.fill('#analyse-text', `Rate test ${i}: claim your prize now at http://prize.test`);
    await page.waitForFunction(() => !document.querySelector('form button[type=submit]').disabled);
    await page.click('form button[type=submit]');
    await page.waitForSelector('section[aria-live] h2, [data-slot=alert]', { timeout: 30000 });
    const alert = page.locator('[data-slot=alert]');
    if ((await alert.count()) && (await alert.innerText()).includes('a lot of messages')) limited = true;
  }
  check('AI checker rate-limited on the 11th request', limited && attempts === 11, `attempts ${attempts}`);
  // Lookups: 60 per minute per IP.
  const codes = [];
  for (let i = 0; i < 62; i++) {
    const r = await fetch(`${BASE}/en/check?q=600000${String(1000 + i)}`);
    codes.push((await r.text()).includes('Too many checks'));
  }
  // Sliding window: the 4 earlier lookups count, partly decayed depending on timing,
  // so blocking must start between loop index 56 and 60, and stay on.
  const first = codes.indexOf(true);
  check('lookups rate-limited after 60 in a minute', first >= 56 && first <= 60 && codes.slice(first).every(Boolean), `${first}`);
  const rlKeys = execFileSync('docker', ['exec', 'kavach-redis', 'redis-cli', '--scan', '--pattern', 'kavach:rl:*']).toString();
  check('rate-limit keys hold hashed IPs, never raw IPs', rlKeys.length > 0 && !/127\.0\.0\.1|::1/.test(rlKeys));
  execFileSync('docker', ['exec', 'kavach-redis', 'redis-cli', 'FLUSHALL']);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
});
