// Browser check of the PRODUCTION image (LOCAL ONLY). usage: node neptive/dev/prod-check.mjs
// Needs: rehearse-prod-image.sh up, node neptive/dev/tls-proxy.mjs, the rehearsal DB. Env as in qa-variants.mjs.
// For each of 1440x900 and 390x844: admin login, calendar, /agency/<customer>/ped, portal home, portal PED.
// On every page it reports: dev overlays (Next "Issues" badge / error portal, CopilotKit inspector pill), visible
// "Postiz" (text, title, meta, alt/title/placeholder/aria-label), images that failed to load, console errors.
// Screenshots: neptive/dev/.data/shots/prod/<size>-<name>.png
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';

const require = createRequire(os.homedir() + '/.local/share/mise/installs/npm-playwright/latest/node_modules/');
const { chromium } = require('playwright');
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = process.env.PZN_SHOTS || new URL('./.data/shots/prod/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.PZN_BASE || 'https://portal.neptive.com';
const DB = process.env.PZN_DB || 'rehearsal';
const RULES = process.env.PZN_HOST_RULES || 'MAP portal.neptive.com 127.0.0.1:8443';
const ORG = 'd6d585e7-d225-4225-9f96-d8b595c53d72';
const CASA = 'fd131113-859b-4d55-9567-4c4d4ce68352';
const AURORA = '7233ce6e-bd06-46cd-9d5e-cc53d19cdeec';
const AURORA_USER = '4ba46056-00e2-46e0-8627-42b47b46184b';

const psql = (sql) => execFileSync('docker', ['exec', '-i', 'pzn-postgres', 'psql', '-U', 'postiz-app', '-d', DB, '-At', '-c', sql]).toString().trim();
function magicLink() {
  const token = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  psql(`insert into neptive_magic_links(id,"tokenHash","clientUserId","customerId","orgId","expiresAt") values (gen_random_uuid()::text,'${hash}','${AURORA_USER}','${AURORA}','${ORG}', now() + interval '1 hour')`);
  return `${BASE}/portal/magic/${token}`;
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', `--host-resolver-rules=${RULES}`],
});
const findings = [];
const say = (l) => { findings.push(l); console.log(l); };

async function inspect(page, label) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const visible = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
    const overlays = [...document.querySelectorAll('nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button], #copilotkit-dev-console, [class*="copilotkit-dev"], [data-testid*="inspector"]')].filter(visible).length;
    const text = document.body.innerText;
    const devText = ['Open Inspector', 'Hide Inspector', 'Runtime error'].filter((t) => text.includes(t)).concat(/\b\d+ Issues?\b/.test(text) ? ['N Issues'] : []);
    const attrs = [...document.querySelectorAll('[alt],[title],[placeholder],[aria-label]')].flatMap((e) => ['alt', 'title', 'placeholder', 'aria-label'].map((a) => e.getAttribute(a) || ''));
    const metas = [...document.querySelectorAll('meta[content]')].map((m) => m.content);
    const hay = [text, document.title, ...attrs, ...metas].join('\n');
    const postiz = (hay.match(/.{0,30}postiz.{0,30}/gi) || []).slice(0, 5);
    const imgs = [...document.images].filter(visible);
    const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 100));
    return { overlays, devText, postiz, imgs: imgs.length, broken, htmlPostiz: (document.documentElement.outerHTML.match(/postiz/gi) || []).length, overflow: document.documentElement.scrollWidth - innerWidth, title: document.title };
  });
  say(`  ${label}: title "${r.title}" | dev overlays ${r.overlays} ${JSON.stringify(r.devText)} | visible Postiz ${r.postiz.length ? JSON.stringify(r.postiz) : 'none'} | images ${r.imgs}, broken ${r.broken.length}${r.broken.length ? ' ' + JSON.stringify(r.broken.slice(0, 3)) : ''} | overflow ${r.overflow}px | "postiz" substrings in raw DOM ${r.htmlPostiz}`);
  return r;
}
async function shot(page, w, name) {
  const r = await inspect(page, `${w}-${name}`);
  await page.screenshot({ path: `${OUT}${w}-${name}.png` });
  return r;
}

for (const w of [1440, 390]) {
  const h = w < 500 ? 844 : 900;
  const mobile = w < 500;
  say(`---- ${w}x${h}`);
  const ctxOpts = { viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, ignoreHTTPSErrors: true };
  const admin = await browser.newContext(ctxOpts);
  await admin.addCookies([{ name: 'i18next', value: 'it', url: BASE }]);
  const page = await admin.newPage();
  page.on('pageerror', (e) => say(`  PAGEERROR ${new URL(page.url()).pathname} ${e.message.slice(0, 160)}`));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && say(`  CONSOLE ${new URL(page.url()).pathname} ${m.text().slice(0, 160)}`));
  page.on('response', (r) => r.status() >= 400 && say(`  HTTP ${r.status()} ${r.url().slice(0, 120)}`));
  page.on('requestfailed', (rq) => !rq.url().includes('_rsc=') && say(`  REQFAILED ${rq.url().slice(0, 100)} ${rq.failure()?.errorText}`));
  await page.goto(BASE + '/auth/login', { waitUntil: 'load' });
  await shot(page, w, 'admin-login');
  await page.fill('input[name="email"]', 'admin@neptive.com');
  await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD || 'neptive-local-admin');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60000 }).catch(() => say('  admin login did not leave /auth'));
  await page.goto(BASE + '/launches', { waitUntil: 'load' });
  await shot(page, w, 'admin-calendar');
  await page.goto(`${BASE}/agency/${CASA}/ped`, { waitUntil: 'load' });
  await shot(page, w, 'admin-agency-ped');
  await admin.close();

  const client = await browser.newContext(ctxOpts);
  await client.addCookies([{ name: 'i18next', value: 'it', url: BASE }]);
  const cp = await client.newPage();
  cp.on('pageerror', (e) => say(`  PAGEERROR ${new URL(cp.url()).pathname} ${e.message.slice(0, 160)}`));
  cp.on('response', (r) => r.status() >= 400 && say(`  HTTP ${r.status()} ${r.url().slice(0, 120)}`));
  cp.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && say(`  CONSOLE ${new URL(cp.url()).pathname} ${m.text().slice(0, 160)}`));
  await cp.goto(magicLink(), { waitUntil: 'load' });
  await cp.getByRole('button', { name: /continua|continue/i }).click();
  await cp.waitForURL((u) => u.pathname === '/portal', { timeout: 30000 }).catch(() => say('  magic link did not reach /portal'));
  await shot(cp, w, 'portal-home');
  await cp.goto(BASE + '/portal/ped', { waitUntil: 'load' });
  await shot(cp, w, 'portal-ped');
  await client.close();
}
await browser.close();
