// Quick screenshots while iterating (LOCAL ONLY). usage: node neptive/dev/peek.mjs <path> [w] [h] [out-name] [--admin] [--full]
import { createRequire } from 'node:module';
import os from 'node:os';
import { mkdirSync } from 'node:fs';
const require = createRequire(os.homedir() + '/.local/share/mise/installs/npm-playwright/latest/node_modules/');
const { chromium } = require('playwright');
const OUT = new URL('./.data/shots/peek/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [path = '/auth/login', w = '1440', h = '900', name = 'peek'] = args;
const admin = process.argv.includes('--admin');
const full = process.argv.includes('--full');
const light = process.argv.includes('--light');
const lang = (process.argv.find((a) => a.startsWith('--lang=')) || '--lang=it').split('=')[1];
const BASE = 'http://localhost:4200';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const mobile = Number(w) < 500;
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
await ctx.addCookies([{ name: 'i18next', value: lang, url: BASE }, ...(light ? [{ name: 'mode', value: 'light', url: BASE }] : [])]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text().slice(0, 200)));
if (admin) {
  await page.goto(BASE + '/auth/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', 'admin@neptive.com');
  await page.fill('input[name="password"]', 'neptive-local-admin');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60000 }).catch(() => {});
}
await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
await page.waitForTimeout(2000);
const probe = (process.argv.find((a) => a.startsWith('--probe=')) || '').split('=')[1];
if (probe) { const [x, y] = probe.split(',').map(Number); console.log('probe', await page.evaluate(([x, y]) => { let e = document.elementFromPoint(x, y); const out = []; for (let i = 0; e && i < 6; i++, e = e.parentElement) out.push(e.tagName + '.' + String(e.className).slice(0, 80) + (e.id ? '#' + e.id : '') + (e.getAttribute('src') ? ' src=' + e.getAttribute('src').slice(0, 60) : '')); return out.join(' < '); }, [x, y])); }
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
await page.screenshot({ path: OUT + name + '.png', fullPage: full });
const info = await page.evaluate(() => ({ title: document.title, icon: [...document.querySelectorAll('link[rel*=icon]')].map((l) => l.getAttribute('href')).join(','), brand: (document.body.innerText.match(/[^\n]*(postiz|gitroom)[^\n]*/gi) || []).slice(0, 8) }));
console.log(OUT + name + '.png', 'overflow', overflow, JSON.stringify(info), errors.join(' | '));
await browser.close();
