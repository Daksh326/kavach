// TEST-ONLY shim: Upstash Redis accepts a "#!lua flags=allow-key-locking"
// script header that open-source Redis rejects. Strip it, forward the rest.
import http from 'node:http';
const strip = (v) => (typeof v === 'string' ? v.replace(/^#!lua flags=allow-key-locking\s*\n/, '') : v);
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      const j = JSON.parse(body || 'null');
      if (Array.isArray(j)) body = JSON.stringify(Array.isArray(j[0]) ? j.map((c) => c.map(strip)) : j.map(strip));
    } catch {}
    const fwd = http.request({ host: '127.0.0.1', port: 8079, path: req.url, method: req.method,
      headers: { ...req.headers, 'content-length': Buffer.byteLength(body) } }, (r) => {
      res.writeHead(r.statusCode, r.headers); r.pipe(res);
    });
    fwd.on('error', () => { res.writeHead(502); res.end(); });
    fwd.end(body);
  });
}).listen(8078, '127.0.0.1', () => console.log('upstash shim on 8078'));
