// Brand screenshot set (LOCAL ONLY). usage: node neptive/dev/brand-shots.mjs [--only=name,name] [--sizes=1440,390]
// Saves neptive/dev/.data/shots/brand/<size>-<name>.png at 1440x900 and 390x844 (Italian UI):
// admin login (empty + wrong password), forgot password, portal login, magic-link page, portal home, portal PED,
// a slot with four variants before a decision and after a confirmation, portal approvals, admin calendar,
// post editor open, settings, /agency, one /agency/<customer>/ped. Re-seeds the Aurora variants demo first
// (neptive/dev/seed-variants.sh) and leaves it confirmed on B. Prints the horizontal overflow of every shot.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';

const require = createRequire(os.homedir() + '/.local/share/mise/installs/npm-playwright/latest/node_modules/');
const { chromium } = require('playwright');
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = ROOT + 'neptive/dev/.data/shots/brand/';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:4200';
const ORG = 'd6d585e7-d225-4225-9f96-d8b595c53d72';
const CASA = 'fd131113-859b-4d55-9567-4c4d4ce68352';
const AURORA = '7233ce6e-bd06-46cd-9d5e-cc53d19cdeec';
const AURORA_USER = '4ba46056-00e2-46e0-8627-42b47b46184b';
const ITEM = '5eed0000-0000-4000-8000-000000000001';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const only = arg('only', '') ? arg('only', '').split(',') : null;
const sizes = arg('sizes', '1440,390').split(',').map(Number);
const lang = arg('lang', 'it');
const light = process.argv.includes('--light');
const want = (n) => !only || only.includes(n);

const psql = (sql) =>
  execFileSync('docker', ['exec', '-i', 'pzn-postgres', 'psql', '-U', 'postiz-app', '-d', 'postiz-db', '-At', '-c', sql]).toString().trim();
function magicLink() {
  const token = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  psql(`insert into neptive_magic_links(id,"tokenHash","clientUserId","customerId","orgId","expiresAt") values (gen_random_uuid()::text,'${hash}','${AURORA_USER}','${AURORA}','${ORG}', now() + interval '1 hour')`);
  return `${BASE}/portal/magic/${token}`;
}

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const log = [];
const HIDE_DEV = 'nextjs-portal, [data-nextjs-toast], #copilotkit-dev-console { display: none !important; }';

async function newPage(w) {
  const h = w < 500 ? 844 : 900;
  const mobile = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await ctx.addCookies([{ name: 'i18next', value: lang, url: BASE }, ...(light ? [{ name: 'mode', value: 'light', url: BASE }] : [])]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log.push(`PAGEERROR ${new URL(page.url()).pathname} ${e.message.slice(0, 160)}`));
  return { ctx, page };
}
async function shot(page, w, name, opts = {}) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.addStyleTag({ content: HIDE_DEV }).catch(() => {});
  await page.waitForTimeout(opts.wait ?? 1500);
  const file = `${OUT}${light ? 'light-' : ''}${w}-${name}.png`;
  await page.screenshot({ path: file, fullPage: !!opts.full });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const line = `${w}-${name}  overflow ${overflow}px  title "${await page.title()}"`;
  log.push(line);
  console.log(line);
}
async function adminLogin(page) {
  await page.goto(BASE + '/auth/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', 'admin@neptive.com');
  await page.fill('input[name="password"]', 'neptive-local-admin');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60000 }).catch(() => {});
}
const slotTop = async (page, w) => {
  await page.locator(`#slot-${ITEM}`).evaluate((el, off) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off), w < 500 ? 8 : 110);
  await page.waitForTimeout(500);
};

execFileSync(ROOT + 'neptive/dev/seed-variants.sh', { stdio: 'pipe' });

for (const w of sizes) {
  // ---------------- auth (signed out)
  {
    const { ctx, page } = await newPage(w);
    if (want('login')) {
      await page.goto(BASE + '/auth/login', { waitUntil: 'networkidle' });
      await shot(page, w, 'admin-login');
      await page.fill('input[name="email"]', 'admin@neptive.com');
      await page.fill('input[name="password"]', 'password-sbagliata');
      await page.click('button[type="submit"]');
      await page.getByRole('alert').waitFor({ timeout: 15000 }).catch(() => log.push('no alert after wrong password'));
      await shot(page, w, 'admin-login-error');
    }
    if (want('forgot')) {
      await page.goto(BASE + '/auth/forgot', { waitUntil: 'networkidle' });
      await shot(page, w, 'admin-forgot');
    }
    if (want('portal-login')) {
      await page.goto(BASE + '/portal/login', { waitUntil: 'networkidle' });
      await shot(page, w, 'portal-login');
    }
    await ctx.close();
  }
  // ---------------- portal
  if (want('portal')) {
    const { ctx, page } = await newPage(w);
    await page.goto(magicLink(), { waitUntil: 'networkidle' });
    await shot(page, w, 'portal-magic');
    await page.getByRole('button', { name: /continua|continue/i }).click();
    await page.waitForURL((u) => u.pathname === '/portal', { timeout: 30000 }).catch(() => {});
    await shot(page, w, 'portal-home');
    await page.goto(BASE + '/portal/approvals', { waitUntil: 'networkidle' });
    await shot(page, w, 'portal-approvals');
    await page.goto(BASE + '/portal/ped', { waitUntil: 'networkidle' });
    await shot(page, w, 'portal-ped');
    await slotTop(page, w);
    await shot(page, w, 'portal-slot-before-decision');
    const slot = page.locator(`#slot-${ITEM}`);
    await slot.getByRole('tab', { name: /^Variante B:/ }).click();
    await slot.getByRole('button', { name: 'Approva B' }).first().click({ trial: false }).catch(async () => {
      await slot.getByRole('button', { name: 'Approva B' }).last().click();
    });
    await slot.getByRole('tab', { name: /^Variante B: Variante confermata/ }).waitFor({ timeout: 15000 });
    await slotTop(page, w);
    await shot(page, w, 'portal-slot-after-confirmation');
    await slot.getByRole('tab', { name: /^Variante C:/ }).click();
    await slotTop(page, w);
    await shot(page, w, 'portal-slot-receded-variant');
    await ctx.close();
    execFileSync(ROOT + 'neptive/dev/seed-variants.sh', { stdio: 'pipe' });
  }
  // ---------------- admin
  if (want('admin')) {
    const { ctx, page } = await newPage(w);
    await adminLogin(page);
    await page.goto(BASE + '/launches', { waitUntil: 'networkidle' });
    await shot(page, w, 'admin-calendar', { wait: 2500 });
    const create = page.locator('button:visible').filter({ hasText: /crea post|create post|nuovo post/i }).first();
    if (await create.count()) {
      await create.click().catch(() => {});
      await page.waitForTimeout(4000);
      await shot(page, w, 'admin-post-editor');
      await page.keyboard.press('Escape').catch(() => {});
    } else log.push('post editor: create button not found');
    await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
    await shot(page, w, 'admin-settings');
    await page.goto(BASE + '/agency', { waitUntil: 'networkidle' });
    await shot(page, w, 'admin-agency');
    await page.goto(`${BASE}/agency/${CASA}/ped`, { waitUntil: 'networkidle' });
    await shot(page, w, 'admin-agency-ped', { wait: 2500 });
    await page.goto(`${BASE}/agency/${AURORA}/ped`, { waitUntil: 'networkidle' });
    await shot(page, w, 'admin-agency-ped-variants', { wait: 2500 });
    await ctx.close();
  }
}
await browser.close();
console.log(log.filter((l) => !l.includes('overflow')).join('\n'));
