// Browser QA against the local stack. usage: node qa.mjs <magic-link-url>
// Needs playwright-core (resolved from the mise npm-playwright install) and system chromium.
import { createRequire } from 'node:module';
import os from 'node:os';
const require = createRequire(os.homedir() + '/.local/share/mise/installs/npm-playwright/latest/node_modules/');
const { chromium } = require('playwright');
const SHOTS = new URL('./.data/shots/', import.meta.url).pathname;
const BASE = 'http://localhost:4200';
const CUSTOMER = 'fd131113-859b-4d55-9567-4c4d4ce68352';
const magic = process.argv[2];
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const log = [];
async function shot(page, name) {
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOTS + name + '.png', fullPage: false });
  const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
  log.push(`${name}: ${page.url()} :: ${text}`);
}
// ---- admin
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message.slice(0, 200)));
  await page.goto(BASE + '/auth/login', { waitUntil: 'networkidle' });
  await shot(page, '01-admin-login');
  await page.fill('input[name="email"]', 'admin@neptive.com');
  await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD || 'neptive-local-admin');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60000 }).catch(() => {});
  await page.goto(BASE + '/launches', { waitUntil: 'networkidle' });
  await shot(page, '02-admin-launches');
  await page.goto(BASE + '/agency', { waitUntil: 'networkidle' });
  await shot(page, '03-admin-agency');
  for (const sub of ['', '/ped', '/approvals', '/content', '/users']) {
    await page.goto(`${BASE}/agency/${CUSTOMER}${sub}`, { waitUntil: 'networkidle' });
    await shot(page, '04-admin-agency-customer' + (sub.replace('/', '-') || '-home'));
  }
  await ctx.close();
}
// ---- portal
if (magic) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message.slice(0, 200)));
  await page.goto(magic, { waitUntil: 'networkidle' });
  await shot(page, '10-portal-magic');
  const btn = page.locator('button, a').filter({ hasText: /accedi|entra|continue|continua|sign in|open|apri/i }).first();
  if (page.url().includes('/portal/magic') && (await btn.count())) { await btn.click(); await page.waitForTimeout(4000); await shot(page, '11-portal-after-magic'); }
  await page.goto(BASE + '/portal', { waitUntil: 'networkidle' });
  await shot(page, '12-portal-home');
  await page.goto(BASE + '/portal/ped', { waitUntil: 'networkidle' });
  await shot(page, '13-portal-ped');
  // one post in the date-ordered feed (preview, caption, comments, actions are inline; no modal)
  const card = page.locator('article', { has: page.getByRole('heading', { name: /Mercatini/ }) }).first();
  await card.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8));
  await shot(page, '14-portal-ped-post-detail');
  await page.goto(BASE + '/portal/approvals', { waitUntil: 'networkidle' });
  await shot(page, '15-portal-approvals');
  await ctx.close();
}
await browser.close();
console.log(log.join('\n'));
