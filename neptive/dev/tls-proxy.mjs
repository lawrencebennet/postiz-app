// LOCAL ONLY. TLS-terminating reverse proxy so a production-built image (baked for https://portal.neptive.com)
// can be browsed locally without rebuilding it for another URL. Mirrors what the server's front nginx does:
// terminates TLS, sets X-Forwarded-Proto/For, forwards Host unchanged.
//   node neptive/dev/tls-proxy.mjs [listen=8443] [target=4017]
// The browser maps the hostname with  --host-resolver-rules="MAP portal.neptive.com 127.0.0.1:8443"
// and ignores the self-signed certificate (Playwright: ignoreHTTPSErrors). Nothing leaves the machine.
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const LISTEN = Number(process.argv[2] || 8443);
const TARGET = Number(process.argv[3] || 4017);
const DIR = new URL('./.data/tls/', import.meta.url).pathname;
fs.mkdirSync(DIR, { recursive: true });
if (!fs.existsSync(DIR + 'key.pem')) {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30', '-subj', '/CN=portal.neptive.com',
    '-addext', 'subjectAltName=DNS:portal.neptive.com', '-keyout', DIR + 'key.pem', '-out', DIR + 'cert.pem'], { stdio: 'ignore' });
}

const server = https.createServer({ key: fs.readFileSync(DIR + 'key.pem'), cert: fs.readFileSync(DIR + 'cert.pem') }, (req, res) => {
  const headers = { ...req.headers, 'x-forwarded-proto': 'https', 'x-forwarded-for': req.socket.remoteAddress };
  const up = http.request({ host: '127.0.0.1', port: TARGET, method: req.method, path: req.url, headers }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502); res.end('proxy: ' + e.message); });
  req.pipe(up);
});
server.listen(LISTEN, '127.0.0.1', () => console.log(`tls-proxy https://127.0.0.1:${LISTEN} -> http://127.0.0.1:${TARGET}`));
