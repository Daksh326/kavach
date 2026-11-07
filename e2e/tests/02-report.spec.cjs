// Converted from the phase scripts used during development. Each check() is a soft
// assertion: failures are all reported and the flow continues.
const { test } = require('@playwright/test');
const { BASE, MAIL, FAKE_GEMINI, FAKE_SERVICES, DIR, check, psql, sleep, resetState, otpCode } = require('./helpers.cjs');
const { execFileSync, execSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const S3 = 'http://127.0.0.1:9100/kavach-evidence';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const code = otpCode;
async function signIn(page, email) {
  await page.fill('#email', email);
  await page.click('button[type=submit]');
  await page.waitForSelector('#otp', { timeout: 15000 });
  await page.locator('#otp').fill(await code(email));
}
const next = (page) => page.click('form button[type=submit]');

test.describe.configure({ mode: 'serial' });

test('Phase 3: report wizard, evidence, complaint text, PDF, dashboard', async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  await resetState();

  await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE' });
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

  // ---------- Wizard, signed out ----------
  await page.goto(`${BASE}/en/report`);
  await page.waitForSelector('text=Step 1 of 7');
  await next(page);
  check('step 1 requires a category', await page.locator('text=Please choose an option.').isVisible());
  await page.locator('label:has-text("Fake bank / KYC update")').click();
  await page.fill('#description', 'Caller from "bank" said KYC expired. I told him the OTP 482913 and my card 4111 1111 1111 1111. He then took money.');
  await next(page);
  await page.waitForSelector('text=Step 2 of 7');
  await page.locator('label:has-text("Phone call")').click();
  await next(page);

  await page.waitForSelector('text=Step 3 of 7');
  await page.click('text=Add a detail');
  await page.fill('#id-value-0', 'not a phone');
  await next(page);
  check('invalid identifier blocked', await page.locator('text=doesn\'t look right').first().isVisible());
  await page.fill('#id-value-0', '098765-43210');
  await page.waitForSelector('text=✓ +91 98765 43210');
  check('live normalised preview', true);
  await page.click('text=Add another');
  await page.selectOption('#id-type-1', 'upi');
  await page.fill('#id-value-1', 'Refund.Desk@OKFAKE');
  await page.click('text=Add another');
  await page.selectOption('#id-type-2', 'url');
  await page.fill('#id-value-2', 'https://www.kyc-refund-desk.test/verify?id=9');
  await next(page);

  await page.waitForSelector('text=Step 4 of 7');
  await page.fill('#incidentDate', '2026-10-30');
  await page.locator('label:has-text("Yes")').click();
  await page.fill('#amountLost', '24,999');
  await page.selectOption('#paymentMethod', 'upi');
  await page.fill('#transactionRef', '412345678901');
  await page.fill('#bankAccountLast4', '43');
  await next(page);
  check('last4 must be exactly 4 digits', await page.locator('text=Enter exactly 4 digits.').isVisible());
  await page.fill('#bankAccountLast4', '4321');
  await next(page);

  await page.waitForSelector('text=Step 5 of 7');
  const png = Buffer.from('89504e470d0a1a0a' + crypto.randomBytes(2000).toString('hex'), 'hex');
  const pdfBytes = Buffer.from('%PDF-1.4\n% fake bank statement\n' + 'x'.repeat(3000));
  const bigBytes = Buffer.alloc(11 * 1024 * 1024, 1);
  await page.setInputFiles('input[type=file]', [
    { name: 'chat-screenshot.png', mimeType: 'image/png', buffer: png },
    { name: 'statement.pdf', mimeType: 'application/pdf', buffer: pdfBytes },
    { name: 'huge.png', mimeType: 'image/png', buffer: bigBytes },
    { name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') },
  ]);
  await page.waitForSelector('text=statement.pdf');
  check('oversize file rejected', await page.locator('text=huge.png is larger than 10 MB.').isVisible());
  check('bad file type rejected', await page.locator("text=virus.exe isn't a supported file type.").isVisible());
  await next(page);

  await page.waitForSelector('text=Step 6 of 7');
  await next(page);
  check('consent required to continue', await page.locator('text=Please tick the box to continue.').isVisible());
  await page.locator('input[type=checkbox]').check();
  await next(page);

  await page.waitForSelector('text=Step 7 of 7');
  const review = await page.locator('main').innerText();
  check('review shows normalised identifiers', review.includes('+91 98765 43210') && review.includes('refund.desk@okfake') && review.includes('https://kyc-refund-desk.test/verify'));
  check('review warns about removing OTP and card', review.includes('OTP or PIN') && review.includes('card number'));
  check('signed out -> "Sign in to submit"', await page.locator('text=Sign in to submit').isVisible());

  // Reload mid-way: draft persists (form + files)
  await page.reload();
  try { await page.waitForSelector('text=Step 7 of 7', { timeout: 8000 }); }
  catch (e) {
    console.log('AFTER RELOAD:', (await page.locator('main').innerText()).slice(0, 300), 'ERRORS:', errors.join(' || ').slice(0, 800), 'URL', page.url(), 'HTML', (await page.locator('main').innerHTML()).slice(0, 700));
    console.log('DRAFT:', await page.evaluate(() => localStorage.getItem('kavach:report-draft:v1')?.slice(0, 200)));
    throw e;
  }
  check('draft survives reload (files too)', (await page.locator('main').innerText()).includes('statement.pdf'));

  // ---------- Sign in round trip ----------
  await page.click('text=Sign in to submit');
  await page.waitForURL(u => u.pathname === '/en/login');
  check('login keeps resume target', decodeURIComponent(page.url()).includes('next=/report?resume=1'));
  await signIn(page, 'asha@kavach.test');
  await page.waitForURL(u => u.pathname === '/en/report' && u.search.includes('resume=1'), { timeout: 15000 });
  await page.waitForSelector('text=Step 7 of 7');
  await page.waitForSelector('button:has-text("Submit report")');
  check('back on review after sign-in, with files', (await page.locator('main').innerText()).includes('chat-screenshot.png'));

  await page.click('button:has-text("Submit report")');
  await page.waitForURL(u => /\/en\/report\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 30000 });
  const reportId = new URL(page.url()).pathname.split('/').pop();
  check('lands on report page with banner', (await page.locator('main').innerText()).includes('Your report is saved'));
  await page.waitForTimeout(1000); // longer than the autosave debounce
  check('draft cleared from device after submit', (await page.evaluate(() => localStorage.getItem('kavach:report-draft:v1'))) === null);

  // ---------- DB state ----------
  const row = psql(`select category||'|'||amount_lost||'|'||transaction_ref||'|'||bank_account_last4||'|'||(consent_at is not null)||'|'||consent_version from reports where id='${reportId}'`);
  check('report row saved with consent', row === 'kyc_bank_impersonation|24999.00|412345678901|4321|true|v1', row);
  const desc = psql(`select description from reports where id='${reportId}'`);
  check('OTP and card stripped before saving', desc.includes('[code removed]') && desc.includes('[card number removed]') && !desc.includes('482913') && !desc.includes('4111'), desc);
  const ids = psql(`select string_agg(i.type||':'||i.value_normalized, ',' order by i.type) from report_identifiers ri join identifiers i on i.id=ri.identifier_id where ri.report_id='${reportId}'`);
  check('identifiers stored normalised (url + domain)', ids === 'phone:+919876543210,upi:refund.desk@okfake,url:https://kyc-refund-desk.test/verify,domain:kyc-refund-desk.test', ids);
  const ev = psql(`select string_agg(file_name||':'||sha256||':'||size_bytes, ',' order by file_name) from evidence where report_id='${reportId}'`);
  check('evidence rows have correct SHA-256 and size', ev === `chat-screenshot.png:${sha(png)}:${png.length},statement.pdf:${sha(pdfBytes)}:${pdfBytes.length}`, ev);
  const keys = psql(`select string_agg(r2_key, ',') from evidence where report_id='${reportId}'`).split(',');
  check('object keys contain no file names', keys.every(k => /^evidence\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(k)), keys.join(' '));

  // ---------- Report page ----------
  let txt = await page.locator('main').innerText();
  check('portal text: facts', txt.includes('Amount lost: ₹24,999 via UPI') && txt.includes('Transaction ID / UTR: 412345678901') && txt.includes('Date of incident: 30 October 2026'));
  check('portal text: fraudster details', txt.includes('- Phone number: +91 98765 43210') && txt.includes('- UPI ID: refund.desk@okfake'));
  check('portal text: evidence hashes', txt.includes(sha(png)) && txt.includes(sha(pdfBytes)));
  check('bank letter present (money lost)', txt.includes('For your bank') && txt.includes('account ending in 4321'));
  await page.locator('button:has-text("Copy")').first().click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('copy puts complaint text on clipboard', clip.startsWith('Subject: Online financial fraud') && clip.includes('412345678901'));
  await page.click('button[lang=hi]');
  check('Hindi complaint text', (await page.locator('pre').first().innerText()).includes('धोखाधड़ी का प्रकार: नकली बैंक / KYC अपडेट'));

  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('a:has-text("Download")').first().click()]);
  const dlPath = await dl.path();
  check('evidence download returns original bytes', [sha(png), sha(pdfBytes)].includes(sha(fs.readFileSync(dlPath))));

  await page.selectOption('#status', 'filed_1930');
  await page.waitForSelector('text=Saved');
  check('status update saved', psql(`select status from reports where id='${reportId}'`) === 'filed_1930');

  const [pdfDl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('button:has-text("Download PDF summary")')]);
  const pdfPath = DIR + '/report.pdf';
  await pdfDl.saveAs(pdfPath);
  const pdfText = execSync(`pdftotext ${pdfPath} -`).toString().replace(/\s+/g, ' ');
  check('PDF generated with summary + hashes', pdfText.includes('Scam incident summary') && pdfText.includes(sha(png).slice(0, 32)) && pdfText.includes('412345678901'), pdfText.slice(0, 120));
  execSync(`pdftoppm -png -r 70 -f 1 -l 1 ${pdfPath} ${DIR}/report-pdf`);

  // Add one more file from the report page
  const txtFile = Buffer.from('call log export ' + Date.now());
  await page.setInputFiles('input[type=file]', [{ name: 'call-log.txt', mimeType: 'text/plain', buffer: txtFile }]);
  await page.waitForSelector('text=1 file uploaded.');
  await page.waitForSelector('text=call-log.txt');
  check('add evidence later', psql(`select count(*) from evidence where report_id='${reportId}'`) === '3');
  await page.screenshot({ path: DIR + '/report-page.png', fullPage: true });

  // ---------- Dashboard + export ----------
  await page.goto(`${BASE}/en/dashboard`);
  txt = await page.locator('main').innerText();
  check('dashboard lists report with status', txt.includes('Fake bank / KYC update') && txt.includes('Called 1930') && txt.includes('₹24,999'));
  const [exp] = await Promise.all([page.waitForEvent('download'), page.click('a:has-text("Download my data")')]);
  const data = JSON.parse(fs.readFileSync(await exp.path(), 'utf8'));
  const mine = data.reports.find(r => r.id === reportId);
  check('export contains report + identifiers', mine && mine.scammer_identifiers.length === 4 && data.account.email === 'asha@kavach.test');
  const exportedEv = data.evidence.find(e => e.report_id === reportId && e.file_name === 'statement.pdf');
  const viaLink = exportedEv?.download_url ? Buffer.from(await (await fetch(exportedEv.download_url)).arrayBuffer()) : null;
  check('export download links work', viaLink && sha(viaLink) === sha(pdfBytes));
  check('export has no other users', data.reports.every(r => r.user_id === undefined || r.user_id === data.account.id));
  await page.screenshot({ path: DIR + '/dashboard.png', fullPage: true });

  // ---------- Access control ----------
  const meeraReport = psql(`select id from reports where user_id='a0000000-0000-4000-8000-000000000004' limit 1`);
  const resp = await page.goto(`${BASE}/en/report/${meeraReport}`);
  check("can't open someone else's report", resp.status() === 404);

  // ---------- Delete report ----------
  await page.goto(`${BASE}/en/report/${reportId}`);
  await page.click('button:has-text("Delete report")');
  await page.click('button:has-text("Yes, delete it")');
  await page.waitForURL(u => u.pathname === '/en/dashboard', { timeout: 20000 });
  check('report deleted', psql(`select count(*) from reports where id='${reportId}'`) === '0');
  let gone = true;
  for (const k of keys) gone = gone && (await fetch(`${S3}/${k}`, { method: 'HEAD' })).status === 404;
  check('its files deleted from storage', gone);
  check('deletion queue cleared', psql(`select count(*) from r2_deletion_queue`) === '0');
  check('orphan identifiers removed', psql(`select count(*) from identifiers where value_normalized='refund.desk@okfake'`) === '0');

  // ---------- Report it from /check prefills wizard ----------
  await page.goto(`${BASE}/en/check?q=6000000101`);
  try { await page.click('a:has-text("Report it")', { timeout: 8000 }); }
  catch (e) { console.log('CTA DEBUG', page.url(), JSON.stringify((await page.locator('body').innerText()).slice(0, 500))); throw e; }
  await page.waitForURL(u => u.pathname === '/en/report');
  await page.locator('label:has-text("Fake customer care")').click();
  await next(page);
  await page.locator('label:has-text("SMS")').click();
  await next(page);
  check('"Report it" prefills the identifier', (await page.inputValue('#id-value-0')) === '+916000000101');

  // ---------- Delete account (Ravi) ----------
  await ctx.clearCookies();
  await page.goto(`${BASE}/en/dashboard`);
  await page.waitForURL(u => u.pathname === '/en/login');
  await signIn(page, 'ravi@kavach.test');
  await page.waitForURL(u => u.pathname === '/en/dashboard', { timeout: 15000 });
  const btn = page.locator('button:has-text("Delete everything")');
  check('delete disabled until DELETE typed', await btn.isDisabled());
  await page.fill('#confirm-delete', 'delete');
  await btn.click();
  await page.waitForURL(u => u.pathname === '/en', { timeout: 20000 });
  check('account gone', psql(`select count(*) from auth.users where email='ravi@kavach.test'`) === '0');
  check('their reports gone', psql(`select count(*) from reports where user_id='a0000000-0000-4000-8000-000000000003'`) === '0');
  check('public counts recomputed (UPI drops below threshold)', psql(`select distinct_reporter_count from identifiers where value_normalized='earn.daily.tasks@fakepsp'`) === '1');
  await page.goto(`${BASE}/en/dashboard`);
  check('signed out after deletion', new URL(page.url()).pathname === '/en/login');

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
});
