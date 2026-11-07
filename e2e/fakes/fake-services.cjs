// Stand-ins for Turnstile (widget + siteverify), Sentry ingest and PostHog capture.
const http = require('node:http');
let verifies = [], envelopes = [], events = [];
const used = new Set();
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
const WIDGET = `(() => {
  let n = 0; const widgets = {};
  const issue = (id) => { const o = widgets[id]; if (!o) return;
    setTimeout(() => o.callback((window.__turnstileNext || 'ok') + '-' + (o.action || 'none') + '-' + (++n) + '-' + Math.random().toString(36).slice(2)), 300); };
  window.turnstile = {
    render(el, opts) { const id = 'w' + (++n); widgets[id] = opts; el.dataset.fakeTurnstile = opts.action || ''; issue(id); return id; },
    reset(id) { issue(id); },
    remove(id) { delete widgets[id]; },
  };
})();`;
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const json = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(obj)); };
    if (url.pathname === '/__state') return json(200, { verifies, envelopes, events });
    if (url.pathname === '/__reset') { verifies = []; envelopes = []; events = []; return json(200, {}); }
    if (url.pathname === '/turnstile/api.js') { res.writeHead(200, { 'content-type': 'application/javascript', ...cors }); return res.end(WIDGET); }
    if (url.pathname === '/turnstile/siteverify') {
      const f = new URLSearchParams(body); const token = f.get('response') || '';
      const reuse = used.has(token); used.add(token);
      const ok = f.get('secret') === 'test-secret' && token.startsWith('ok-') && !reuse;
      verifies.push({ token, ok, reuse });
      return json(200, { success: ok, action: token.split('-')[1], 'error-codes': ok ? [] : [reuse ? 'timeout-or-duplicate' : 'invalid-input-response'] });
    }
    if (/^\/api\/\d+\/envelope\/$/.test(url.pathname)) {
      envelopes.push({ project: url.pathname.split('/')[2], auth: req.headers['x-sentry-auth'], body });
      return json(200, { id: 'x' });
    }
    if (url.pathname === '/posthog/i/v0/e/') { try { events.push(JSON.parse(body)); } catch {} return json(200, { status: 1 }); }
    json(404, {});
  });
}).listen(9300, '127.0.0.1', () => console.log('fake services on 9300'));
