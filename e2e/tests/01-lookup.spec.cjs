// Converted from the phase scripts used during development. Each check() is a soft
// assertion: failures are all reported and the flow continues.
const { test } = require('@playwright/test');
const { BASE, MAIL, FAKE_GEMINI, FAKE_SERVICES, DIR, check, psql, sleep, resetState, otpCode } = require('./helpers.cjs');
async function lookup(page, q) {
  await page.goto(`${BASE}/en/check`);
  await page.fill('#check-q', q);
  await page.press('#check-q', 'Enter');
  await page.waitForURL(u => u.search.includes('q='));
  await page.waitForSelector('section[aria-live], [data-slot=alert]');
  return (await page.locator('main').innerText());
}

test.describe.configure({ mode: 'serial' });

test('Phase 2: home, emergency steps, lookups (en + hi)', async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  await resetState();

  const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
  const errors = [];
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', e => errors.push(e.message));

  // Home -> check form (client-side navigation via next/form)
  await page.goto(`${BASE}/en`);
  await page.fill('#check-q', '+91 60000 00101');
  await page.press('#check-q', 'Enter');
  await page.waitForURL(u => u.pathname === '/en/check');
  let txt = await page.locator('main').innerText();
  check('home search -> phone reported by 3', txt.includes('Reported as a scam by 3 people'));
  check('shows category label', txt.includes('Fake bank / KYC update'));
  check('shows channels', txt.includes('Phone call') && txt.includes('SMS'));
  check('shows not-verified wording', txt.includes('Not verified by Kavach'));
  check('shows formatted phone', txt.includes('+91 60000 00101'));

  txt = await lookup(page, '6000000202');
  check('same user twice -> not reported, no count leak', txt.includes('No reports found') && !/Reported as a scam/.test(txt));

  txt = await lookup(page, 'https://www.kyc-update-portal.test/verify?id=99');
  check('url: domain reported by 3', txt.includes('The website kyc-update-portal.test') && txt.includes('Reported as a scam by 3 people'));
  check('url: exact link (1 reporter) not reported', /This exact link\s+https:\/\/kyc-update-portal\.test\/verify\s+No reports found/.test(txt), txt.slice(0, 0));

  txt = await lookup(page, 'super-returns-trading.test');
  check('hidden domain -> not reported', txt.includes('No reports found') && !txt.includes('Reported as a scam'));

  txt = await lookup(page, 'kyc-update-portl.test');
  check('typo domain -> similar reported site shown', txt.includes('Similar websites that were reported') && txt.includes('kyc-update-portal.test'));

  txt = await lookup(page, 'Earn.Daily.Tasks@FAKEPSP');
  check('UPI (mixed case) reported by 2', txt.includes('Reported as a scam by 2 people') && txt.includes('Task or part-time job scam'));

  txt = await lookup(page, 'upi://pay?pa=earn.daily.tasks@fakepsp&am=500');
  check('UPI QR link -> reported', txt.includes('Reported as a scam by 2 people'));

  txt = await lookup(page, 'wa.me/916000000101');
  check('WhatsApp link -> phone extracted + reported', txt.includes('This WhatsApp link opens a chat with +91 60000 00101') && txt.includes('Reported as a scam by 3 people'));

  txt = await lookup(page, 'https://bit.ly/3abcXYZ');
  check('shortener -> shared platform note', txt.includes('big platform'));

  txt = await lookup(page, 'hello there');
  check('garbage -> friendly error', txt.includes("We couldn't recognise that"));

  txt = await lookup(page, 'http://192.168.1.5/login');
  check('IP link -> specific warning', txt.includes('bare IP address'));

  // Hindi
  await page.goto(`${BASE}/hi/check?q=6000000101`);
  txt = await page.locator('main').innerText();
  check('Hindi result', txt.includes('3 लोगों ने इसे स्कैम बताया है') && txt.includes('नकली बैंक / KYC अपडेट'), txt.slice(0, 200));

  // Emergency checklist persists
  await page.goto(`${BASE}/en/emergency`);
  check('emergency progress starts at 0', (await page.locator('[aria-live=polite]').first().innerText()).includes('0 of 7 done'));
  await page.locator('#portal label').click();
  await page.locator('#call1930 label').click();
  await page.reload();
  await page.waitForTimeout(300);
  const prog = await page.locator('[aria-live=polite]').first().innerText();
  check('ticks persist after reload', prog.includes('2 of 7 done'), prog);
  check('1930 action is a tel: link', (await page.locator('#call1930 a[href="tel:1930"]').count()) === 1);
  check('portal link opens new tab safely', (await page.locator('#portal a[href="https://cybercrime.gov.in/"][rel="noopener noreferrer"]').count()) === 1);

  // Home analyse box: empty -> error; text -> handoff to /analyse without URL leak
  await page.goto(`${BASE}/en`);
  await page.click('form:has(#analyse-text) button[type=submit]');
  check('analyse empty -> error', await page.locator('text=Paste a message first.').isVisible());
  await page.fill('#analyse-text', 'Dear customer your SBI account will be blocked, update KYC at http://x.test');
  await page.click('form:has(#analyse-text) button[type=submit]');
  await page.waitForURL(u => u.pathname === '/en/analyse');
  const draft = await page.evaluate(() => sessionStorage.getItem('kavach:analyse-draft'));
  check('analyse text handed off via sessionStorage, not URL', draft?.startsWith('Dear customer') && !page.url().includes('KYC'));

  // Layout sanity at 360px: no horizontal scroll on key pages
  for (const p of ['/en', '/hi', '/en/emergency', '/hi/emergency', '/en/check?q=6000000101']) {
    await page.goto(BASE + p);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`no horizontal scroll ${p}`, !overflow);
  }
  await page.goto(`${BASE}/hi/emergency`);
  await page.screenshot({ path: DIR + '/hi-emergency.png', fullPage: false });
  await page.goto(`${BASE}/en/check?q=wa.me/916000000101`);
  await page.screenshot({ path: DIR + '/check-result.png', fullPage: true });
  await page.goto(`${BASE}/en`);
  await page.screenshot({ path: DIR + '/home.png', fullPage: true });

  check('no console errors', errors.length === 0, errors.join(' | '));
});
