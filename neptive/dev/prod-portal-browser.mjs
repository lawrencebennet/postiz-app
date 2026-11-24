// LOCAL ONLY. Real browser on the production image in production shape (https://portal.neptive.com mapped to
// neptive/dev/tls-proxy.mjs): open a magic link page, "Continua", portal, then "Esci". Both POSTs come from the
// page itself, so they show that the CSRF rule lets the real frontend through. Then the password login form.
// usage (rehearsal running + tls-proxy): PZN_DB=rehearsal node neptive/dev/prod-portal-browser.mjs
import { createRequire } from 'node:module';
import os from 'node:os';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
const require = createRequire(os.homedir() + '/.local/share/mise/installs/npm-playwright/latest/node_modules/');
const { chromium } = require('playwright');

const BASE = 'https://portal.neptive.com';
const DB = process.env.PZN_DB || 'rehearsal';
const sql = (q) => execFileSync('docker', ['exec', 'pzn-postgres', 'psql', '-U', 'postiz-app', '-d', DB, '-Atc', q]).toString().trim();
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ' :: ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--host-resolver-rules=MAP portal.neptive.com 127.0.0.1:8443'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
const errors = [];
const page = await ctx.newPage();
page.on('response', (r) => r.url().includes('/api/neptive/') && r.request().method() !== 'GET' && errors.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`));

// agency: admin login in the browser, then a magic link for Casa Pandora from the agency API (same origin)
await page.goto(BASE + '/auth/login', { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', 'admin@neptive.com');
await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD || 'neptive-local-admin');
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 90000 });
const CP = sql(`select id from "Customer" where name='Casa Pandora' and "deletedAt" is null limit 1`);
const email = sql(`select email from neptive_client_users where "customerId"='${CP}' and "deletedAt" is null limit 1`);
const link = await page.evaluate(async ({ CP, email }) => {
  const r = await fetch(`/api/neptive/agency/clients/${CP}/users`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name: 'Casa Pandora' }) });
  return (await r.json()).url;
}, { CP, email });
check('agency generated a link from the page', /^https:\/\/portal\.neptive\.com\/portal\/magic\//.test(link || ''), link ? 'ok' : 'none');

const client = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } })).newPage();
client.on('response', (r) => r.url().includes('/api/neptive/') && r.request().method() !== 'GET' && errors.push(`client ${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`));
await client.goto(link, { waitUntil: 'networkidle' });
await client.getByRole('button', { name: /Continua/ }).click();
await client.waitForURL((u) => u.pathname === '/portal', { timeout: 30000 });
check('magic link page -> Continua -> /portal (production image, same origin)', new URL(client.url()).pathname === '/portal');
await client.goto(BASE + '/portal/ped', { waitUntil: 'networkidle' });
check('portal PED loads', /Piano editoriale/i.test(await client.locator('body').innerText()));
await client.getByRole('button', { name: 'Esci' }).first().click();
await client.waitForURL('**/portal/login', { timeout: 20000 });
const me = await client.evaluate(async () => (await fetch('/api/neptive/portal/me', { credentials: 'include' })).status);
check('Esci -> /portal/login, /me answers 401', me === 401, `${me}`);
await client.fill('input[name="email"]', email);
await client.fill('input[name="password"]', 'non-e-la-password');
await client.click('button[type="submit"]');
await client.locator('[role="alert"]:not(#__next-route-announcer__)').waitFor();
check('password form posts and gets the generic error', /Email o password non corretti/.test(await client.locator('[role="alert"]:not(#__next-route-announcer__)').innerText()));
console.log('mutating requests seen:', errors.join(', '));
check('no mutating request from the pages was refused with 403', !errors.some((e) => / 403$/.test(e)));
sql('delete from neptive_login_attempts');
await browser.close();
console.log(failures ? `${failures} FAILED` : 'all checks passed');
process.exit(failures ? 1 : 0);
