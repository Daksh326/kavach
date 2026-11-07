// Minimal stand-in for generativelanguage.googleapis.com generateContent.
const http = require('node:http');
let count = 0; let last = null; let lastHeaders = null;
const reply = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const ok = (res, payload, finishReason = 'STOP') =>
  reply(res, 200, { candidates: [{ content: { parts: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] }, finishReason }] });

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/__state') return reply(res, 200, { count, last, lastHeaders });
  if (req.method === 'POST' && req.url === '/__reset') { count = 0; last = null; return reply(res, 200, {}); }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (!/\/v1beta\/models\/[^/:]+:generateContent$/.test(req.url)) return reply(res, 404, { error: { message: 'not found' } });
    if (req.headers['x-goog-api-key'] !== 'fake-test-key') return reply(res, 403, { error: { message: 'bad key' } });
    count++; last = JSON.parse(body); lastHeaders = req.headers;
    const parts = last.contents[0].parts;
    const text = parts.map((p) => p.text || '').join('\n');
    const hindi = last.systemInstruction.parts[0].text.includes('Hindi (Devanagari');
    if (text.includes('FAKE429')) return reply(res, 429, { error: { status: 'RESOURCE_EXHAUSTED' } });
    if (text.includes('FAKESAFETY')) return ok(res, '', 'SAFETY');
    if (text.includes('FAKEBADJSON')) return ok(res, 'Sorry, here is my answer: definitely a scam');
    const image = parts.find((p) => p.inlineData);
    if (image) {
      return ok(res, {
        risk: 'high', scam_type: 'upi_collect_request',
        red_flags: ['Asks you to enter your UPI PIN to receive money'],
        extracted_identifiers: [{ type: 'upi', value: 'earn.daily.tasks@fakepsp' }],
        advice: `Screenshot of ${image.inlineData.mimeType}, ${Buffer.from(image.inlineData.data, 'base64').length} bytes. Do not enter your PIN.`,
      });
    }
    const urls = [...text.matchAll(/https?:\/\/[^\s<]+/g)].map((m) => ({ type: 'url', value: m[0] }));
    const phones = [...text.matchAll(/\b[6-9]\d{9}\b/g)].map((m) => ({ type: 'phone', value: m[0] }));
    return ok(res, {
      risk: 'medium', // the app should RAISE this when an identifier is publicly reported
      scam_type: 'kyc_bank_impersonation',
      red_flags: hindi ? ['खाता बंद करने की धमकी', 'बैंक जैसा दिखने वाला नकली लिंक'] : ['Threatens to block your account', 'Link is not the bank\'s real website'],
      extracted_identifiers: [...urls, ...phones],
      advice: hindi ? 'लिंक न खोलें। पैसे कटे हों तो तुरंत 1930 पर कॉल करें।' : 'Do not open the link. If you paid, call 1930 now.',
    });
  });
}).listen(9200, '127.0.0.1', () => console.log('fake gemini on 9200'));
