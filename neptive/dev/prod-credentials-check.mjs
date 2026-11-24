// LOCAL ONLY. Client-credential checks against the PRODUCTION IMAGE in the rehearsal setup (secured mode:
// https, Secure/httpOnly cookies, the image's own nginx behind neptive/dev/tls-proxy.mjs, like production's
// host nginx -> container nginx). Needs: rehearse-prod-image.sh restore/env/schema/up + node tls-proxy.mjs.
// Checks the cookie attributes, the restricted session, the recognised-browser bypass of the account lock,
// and that a client-written X-Forwarded-For does not move the IP bucket. Leaves no password behind.
import https from 'node:https';
import { execFileSync } from 'node:child_process';

const HOST = 'portal.neptive.com';
const ORIGIN = `https://${HOST}`;
const DB = process.env.PZN_DB || 'rehearsal';
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ' :: ' + detail : ''}`);
};
const sql = (q) => execFileSync('docker', ['exec', 'pzn-postgres', 'psql', '-U', 'postiz-app', '-d', DB, '-Atc', q]).toString().trim();

function request(method, path, { body, cookies = {}, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = https.request(
      {
        host: '127.0.0.1',
        port: 8443,
        servername: HOST,
        rejectUnauthorized: false,
        method,
        path,
        headers: {
          Host: HOST,
          Origin: ORIGIN,
          'Content-Type': 'application/json',
          ...(Object.keys(cookies).length ? { Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          const setCookies = res.headers['set-cookie'] || [];
          const jar = {};
          for (const line of setCookies) {
            const [pair, ...attrs] = line.split(';');
            const i = pair.indexOf('=');
            jar[pair.slice(0, i).trim()] = { value: pair.slice(i + 1), attrs: attrs.map((a) => a.trim()) };
          }
          let json = {};
          try { json = JSON.parse(text); } catch {}
          resolve({ status: res.statusCode, json, text: text.slice(0, 160), jar, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const CP = sql(`select id from "Customer" where name='Casa Pandora' and "deletedAt" is null limit 1`);
const user = sql(`select id||'|'||email from neptive_client_users where "customerId"='${CP}' and "deletedAt" is null limit 1`).split('|');
const [userId, email] = user;
sql('delete from neptive_login_attempts');

const admin = await request('POST', '/api/auth/login', { body: { email: 'admin@neptive.com', password: process.env.ADMIN_PASSWORD || 'neptive-local-admin', provider: 'LOCAL' } });
const auth = admin.jar.auth?.value;
check('admin login on the production image', !!auth, `${admin.status}`);
const agency = (method, path, body) => request(method, `/api${path}`, { body, cookies: { auth } });

const temp = await agency('POST', `/neptive/agency/clients/${CP}/users/${userId}/temporary-password`, {});
check('agency temporary password', temp.status === 200 && /^[a-z2-9-]{19}$/.test(temp.json.password || ''), `${temp.status}`);
check('temporary password response is no-store', /no-store/.test(temp.headers['cache-control'] || ''), temp.headers['cache-control']);

const login = await request('POST', '/api/neptive/portal-auth/login', { body: { email, password: temp.json.password } });
const session = login.jar.neptive_portal;
const device = login.jar.neptive_portal_device;
check('login with the temporary password', login.status === 200 && login.json.passwordChangeRequired === true, JSON.stringify(login.json));
const attrs = (c) => (c ? c.attrs.map((a) => a.split('=')[0].toLowerCase() + (a.includes('=') ? '=' + a.split('=')[1] : '')).join('; ') : 'missing');
check('session cookie: Domain=.neptive.com; Secure; HttpOnly; SameSite=None', !!session && ['domain=.neptive.com', 'secure', 'httponly', 'samesite=None'].every((a) => attrs(session).includes(a)), attrs(session));
check('device cookie: same attributes', !!device && ['domain=.neptive.com', 'secure', 'httponly', 'samesite=None'].every((a) => attrs(device).includes(a)), attrs(device));
check('no session in a response header in secured mode', !login.headers['neptive-portal']);

const blocked = await request('GET', '/api/neptive/portal/peds', { cookies: { neptive_portal: session.value } });
check('temporary-password session: /peds refused', blocked.status === 403, `${blocked.status} ${blocked.text}`);
const NEW = 'Collaudo immagine 2026';
const changed = await request('POST', '/api/neptive/portal/account/password', { body: { newPassword: NEW }, cookies: { neptive_portal: session.value } });
const fresh = changed.jar.neptive_portal;
check('forced change on the production image', changed.status === 200 && !!fresh, `${changed.status} ${changed.text}`);
check('the new session reads the PED', (await request('GET', '/api/neptive/portal/peds', { cookies: { neptive_portal: fresh.value } })).status === 200);
check('the temporary session is dead', (await request('GET', '/api/neptive/portal/me', { cookies: { neptive_portal: session.value } })).status === 401);
const myDevice = changed.jar.neptive_portal_device || device;

// account lock from "elsewhere", each attempt with a different client-written X-Forwarded-For
const codes = [];
for (let i = 0; i < 5; i++) {
  codes.push((await request('POST', '/api/neptive/portal-auth/login', { body: { email, password: 'sbagliata ' + i }, headers: { 'X-Forwarded-For': `6.6.6.${i}` } })).status);
}
const locked = await request('POST', '/api/neptive/portal-auth/login', { body: { email, password: NEW }, headers: { 'X-Forwarded-For': '6.6.6.99' } });
check('5 failures lock the account for unknown browsers (429 with Retry-After)', codes.join() === '401,401,401,401,401' && locked.status === 429 && Number(locked.headers['retry-after']) > 800, `${codes.join()} -> ${locked.status} retry-after ${locked.headers['retry-after']}`);
const mine = await request('POST', '/api/neptive/portal-auth/login', { body: { email, password: NEW }, cookies: { neptive_portal_device: myDevice.value } });
check("the client's own browser (device cookie) still gets in", mine.status === 200, `${mine.status}`);
sql('delete from neptive_login_attempts');

// IP bucket: 20 failures for 20 different emails, each claiming a different IP in X-Forwarded-For
for (let i = 0; i < 20; i++) {
  await request('POST', '/api/neptive/portal-auth/login', { body: { email: `nessuno${i}@esempio.it`, password: 'x x x x x x' }, headers: { 'X-Forwarded-For': `9.9.${i}.1` } });
}
const ipLocked = await request('POST', '/api/neptive/portal-auth/login', { body: { email: 'altro@esempio.it', password: 'x x x x x x' }, headers: { 'X-Forwarded-For': '8.8.8.8' } });
check('IP bucket counts the address the proxy saw, a forged X-Forwarded-For does not escape it', ipLocked.status === 429, `${ipLocked.status}`);

// CSRF in production shape (same origin https://portal.neptive.com through the image's nginx)
{
  const CSRF = /Cross-site request refused|JSON body required|Origin required/;
  const link = await agency('POST', `/neptive/agency/clients/${CP}/users`, { email, name: 'Casa Pandora' });
  const token = link.json.url.split('/').pop();
  const evil = { Origin: 'https://evil.example' };
  const crossMagic = await request('POST', '/api/neptive/portal-auth/magic', { body: { token }, headers: evil });
  const formMagic = await request('POST', '/api/neptive/portal-auth/magic', { body: { token }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  const rightMagic = await request('POST', '/api/neptive/portal-auth/magic', { body: { token } });
  check(`magic consumption: cross-site ${crossMagic.status}, form ${formMagic.status}; same origin ${rightMagic.status} with a session cookie`,
    crossMagic.status === 403 && CSRF.test(crossMagic.text) && formMagic.status === 403 && rightMagic.status === 201 && !!rightMagic.jar.neptive_portal, rightMagic.text);
  const s = rightMagic.jar.neptive_portal.value;
  const ped = sql(`select id from neptive_editorial_plans where "customerId"='${CP}' and "deletedAt" is null order by "createdAt" limit 1`);
  const crossPed = await request('POST', `/api/neptive/portal/peds/${ped}/transition`, { body: { status: 'DRAFT' }, cookies: { neptive_portal: s }, headers: evil });
  const rightPed = await request('POST', `/api/neptive/portal/peds/${ped}/transition`, { body: { status: 'DRAFT' }, cookies: { neptive_portal: s } });
  check(`PED transition: cross-site ${crossPed.status}; same origin ${rightPed.status}`, crossPed.status === 403 && CSRF.test(crossPed.text) && !CSRF.test(rightPed.text), rightPed.text.slice(0, 60));
  const crossAppr = await request('POST', `/api/neptive/portal/approvals/00000000-0000-4000-8000-000000000000/transition`, { body: { status: 'APPROVED' }, cookies: { neptive_portal: s }, headers: evil });
  check(`approval transition: cross-site ${crossAppr.status} (refused before any lookup)`, crossAppr.status === 403 && CSRF.test(crossAppr.text));
  const crossOut = await request('POST', '/api/neptive/portal-auth/logout', { body: {}, cookies: { neptive_portal: s }, headers: evil });
  check(`logout cross-site ${crossOut.status}, session still alive`, crossOut.status === 403 && (await request('GET', '/api/neptive/portal/me', { cookies: { neptive_portal: s } })).status === 200);
  const rightOut = await request('POST', '/api/neptive/portal-auth/logout', { body: {}, cookies: { neptive_portal: s } });
  check(`logout same origin ${rightOut.status}, session gone`, rightOut.status === 201 && (await request('GET', '/api/neptive/portal/me', { cookies: { neptive_portal: s } })).status === 401);
}

// cleanup
const removed = await agency('DELETE', `/neptive/agency/clients/${CP}/users/${userId}/password`, {});
check('cleanup: password removed', removed.status === 200 && removed.json.removed === true, removed.text);
sql('delete from neptive_login_attempts');
console.log(failures ? `${failures} FAILED` : 'all checks passed');
process.exit(failures ? 1 : 0);
