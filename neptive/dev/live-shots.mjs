// Public-page screenshots of the live portal (no login, no magic link). usage: node neptive/dev/live-shots.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
const require = createRequire(os.homedir() + '/.local/share/mise/installs/npm-playwright/latest/node_modules/');
const { chromium } = require('playwright');
const OUT = new URL('./.data/shots/live/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const mobile = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await ctx.addCookies([{ name: 'i18next', value: 'it', url: 'https://portal.neptive.com' }]);
  const page = await ctx.newPage();
  for (const [path, name] of [['/auth/login', 'auth-login'], ['/portal/login', 'portal-login']]) {
    const r = await page.goto('https://portal.neptive.com' + path, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const info = await page.evaluate(() => ({ title: document.title, postiz: (document.body.innerText + document.title).match(/postiz/gi)?.length || 0, overlays: document.querySelectorAll('nextjs-portal,[data-nextjs-toast]').length, overflow: document.documentElement.scrollWidth - innerWidth }));
    await page.screenshot({ path: `${OUT}${w}-${name}.png` });
    console.log(`${w}x${h} ${path} HTTP ${r.status()} ${JSON.stringify(info)}`);
  }
  await ctx.close();
}
await browser.close();
