// Rendered brand sweep (LOCAL ONLY). usage: node neptive/dev/brand-sweep.mjs [--langs=en,it] [--out=file.json]
// Logs in as the local admin, walks the admin pages (settings tabs, post editor, agency), the public pages
// (auth, preview, consent screen) and the client portal (fresh magic link), in every language asked for.
// On each screen it collects what a person can see or a browser shows: visible text, document title, meta
// tags, img src + alt, title / aria-label / placeholder attributes, icon links, the hrefs of visible links.
// Then it searches all of it for upstream brand words and fetches every image to compare it, byte for byte,
// with the upstream logo files (hashes from neptive/brand/upstream-logos.json).
// Exit code 1 when anything is found. Output: neptive/dev/.data/brand-sweep.json (or --out).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';

const require = createRequire(os.homedir() + '/.local/share/mise/installs/npm-playwright/latest/node_modules/');
const { chromium } = require('playwright');
const ROOT = new URL('../../', import.meta.url).pathname;
const DATA = ROOT + 'neptive/dev/.data/';
mkdirSync(DATA, { recursive: true });
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const LANGS = arg('langs', 'en,it').split(',');
const OUT = arg('out', DATA + 'brand-sweep.json');
const BASE = 'http://localhost:4200';
const ORG = 'd6d585e7-d225-4225-9f96-d8b595c53d72';
const CASA = 'fd131113-859b-4d55-9567-4c4d4ce68352';
const AURORA = '7233ce6e-bd06-46cd-9d5e-cc53d19cdeec';
const AURORA_USER = '4ba46056-00e2-46e0-8627-42b47b46184b';
const BRAND = /postiz|gitroom/i;
const upstreamLogos = JSON.parse(readFileSync(ROOT + 'neptive/brand/upstream-logos.json', 'utf8'));
const logoHashes = new Map(Object.entries(upstreamLogos.sha256).map(([f, h]) => [h, f]));

const psql = (sql) =>
  execFileSync('docker', ['exec', '-i', 'pzn-postgres', 'psql', '-U', 'postiz-app', '-d', 'postiz-db', '-At', '-c', sql]).toString().trim();
function magicLink() {
  const token = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  psql(`insert into neptive_magic_links(id,"tokenHash","clientUserId","customerId","orgId","expiresAt") values (gen_random_uuid()::text,'${hash}','${AURORA_USER}','${AURORA}','${ORG}', now() + interval '1 hour')`);
  return `${BASE}/portal/magic/${token}`;
}
const postId = psql(`select id from "Post" where "deletedAt" is null and "organizationId"='${ORG}' order by "publishDate" desc limit 1`);

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const findings = [];
const screens = [];
const imageCache = new Map();

async function collect(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0;
    };
    const attrs = [];
    for (const el of document.querySelectorAll('[title],[aria-label],[placeholder],[alt]')) {
      if (!visible(el) && el.tagName !== 'IMG') continue;
      for (const a of ['title', 'aria-label', 'placeholder', 'alt']) if (el.getAttribute(a)) attrs.push(`${el.tagName.toLowerCase()}@${a}=${el.getAttribute(a)}`);
    }
    const imgs = [...document.querySelectorAll('img')].filter(visible).map((i) => i.currentSrc || i.src);
    const bgs = [...document.querySelectorAll('*')]
      .filter((e) => visible(e) && getComputedStyle(e).backgroundImage.startsWith('url('))
      .map((e) => getComputedStyle(e).backgroundImage.slice(5, -2));
    const svgTitles = [...document.querySelectorAll('svg title')].map((t) => t.textContent);
    const links = [...document.querySelectorAll('a[href]')].filter(visible).map((a) => `${a.innerText.trim().slice(0, 40)} -> ${a.href}`);
    const metas = [...document.querySelectorAll('meta[content]')].map((m) => `${m.getAttribute('name') || m.getAttribute('property')}=${m.content}`);
    const icons = [...document.querySelectorAll('link[rel*=icon],link[rel=manifest],link[rel=apple-touch-icon]')].map((l) => l.href);
    return { title: document.title, text: document.body.innerText, attrs, imgs: [...imgs, ...bgs], svgTitles, links, metas, icons };
  });
}

async function imageHash(ctx, url) {
  if (imageCache.has(url)) return imageCache.get(url);
  let h = null;
  try {
    if (url.startsWith('data:')) h = crypto.createHash('sha256').update(Buffer.from(url.split(',')[1] || '', url.includes(';base64') ? 'base64' : 'utf8')).digest('hex');
    else {
      const r = await ctx.request.get(url);
      if (r.ok()) h = crypto.createHash('sha256').update(await r.body()).digest('hex');
    }
  } catch {}
  imageCache.set(url, h);
  return h;
}

async function check(ctx, page, lang, name) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  const c = await collect(page);
  const where = `${lang} ${name} (${page.url().replace(BASE, '')})`;
  screens.push(where);
  const hit = (kind, value) => findings.push({ where, kind, value: String(value).slice(0, 300) });
  if (BRAND.test(c.title)) hit('title', c.title);
  for (const line of c.text.split('\n')) if (BRAND.test(line)) hit('text', line.trim());
  for (const a of c.attrs) if (BRAND.test(a)) hit('attribute', a);
  for (const t of c.svgTitles) if (BRAND.test(t)) hit('svg-title', t);
  for (const m of c.metas) if (BRAND.test(m)) hit('meta', m);
  for (const l of c.links) if (/postiz|gitroom|discord\.(gg|com)|github\.com\/gitroomhq/i.test(l)) hit('link', l);
  for (const src of [...c.imgs, ...c.icons]) {
    if (BRAND.test(src)) hit('image-src', src);
    const h = await imageHash(ctx, src);
    if (h && logoHashes.has(h)) hit('upstream-logo', `${src} = upstream ${logoHashes.get(h)}`);
  }
}

async function adminSession(lang) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: 'i18next', value: lang, url: BASE }]);
  const page = await ctx.newPage();
  // public screens first, signed out
  for (const [name, path] of [
    ['login', '/auth/login'],
    ['forgot', '/auth/forgot'],
    ['forgot-token', '/auth/forgot/invalid-token'],
    ['activate', '/auth/activate'],
    ['login-required', '/auth/login-required'],
    ['register-root', '/auth'],
    ['consent-signed-out', '/oauth/authorize?client_id=x&redirect_uri=http://localhost/cb&response_type=code'],
    ['connect-link-invalid', '/integrations/connect/invalid-token'],
    ['preview', `/p/${postId}?share=true`],
    ['not-found', '/this-page-does-not-exist'],
  ]) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await check(ctx, page, lang, name);
  }
  // wrong password error
  await page.goto(BASE + '/auth/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', 'admin@neptive.com');
  await page.fill('input[name="password"]', 'definitely-wrong');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await check(ctx, page, lang, 'login-wrong-password');
  await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD || 'neptive-local-admin');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60000 }).catch(() => {});
  for (const [name, path] of [
    ['launches', '/launches'],
    ['analytics', '/analytics'],
    ['media', '/media'],
    ['agents', '/agents'],
    ['plugs', '/plugs'],
    ['third-party', '/third-party'],
    ['billing', '/billing'],
    ['admin-stats', '/admin/stats'],
    ['admin-errors', '/admin/errors'],
    ['err', '/err'],
    ['agency', '/agency'],
    ['agency-casa', `/agency/${CASA}`],
    ['agency-casa-ped', `/agency/${CASA}/ped`],
    ['agency-casa-content', `/agency/${CASA}/content`],
    ['agency-casa-approvals', `/agency/${CASA}/approvals`],
    ['agency-casa-strategy', `/agency/${CASA}/strategy`],
    ['agency-casa-users', `/agency/${CASA}/users`],
    ['agency-aurora-ped', `/agency/${AURORA}/ped`],
    ['consent-signed-in', '/oauth/authorize?client_id=x&redirect_uri=http://localhost/cb&response_type=code'],
  ]) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await check(ctx, page, lang, name);
  }
  // settings: every tab
  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await check(ctx, page, lang, 'settings');
  const tabs = await page.locator('[role="tab"], .settings-tab, [data-tab]').allInnerTexts().catch(() => []);
  const tabNames = tabs.map((t) => t.trim()).filter(Boolean);
  for (const t of [...new Set(tabNames)]) {
    await page.locator('[role="tab"], .settings-tab, [data-tab]').filter({ hasText: t }).first().click().catch(() => {});
    await check(ctx, page, lang, `settings-tab:${t}`);
  }
  // post editor
  await page.goto(BASE + '/launches', { waitUntil: 'networkidle' });
  const create = page.locator('button, div[role=button]').filter({ hasText: /create post|crea post|nuovo post|new post/i }).first();
  if (await create.count()) {
    await create.click().catch(() => {});
    await page.waitForTimeout(2500);
    await check(ctx, page, lang, 'post-editor');
    await page.keyboard.press('Escape').catch(() => {});
  } else findings.push({ where: `${lang} post-editor`, kind: 'note', value: 'create-post button not found' });
  // user/settings menu, language picker, notifications
  await ctx.close();
}

async function portalSession(lang) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addCookies([{ name: 'i18next', value: lang, url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(BASE + '/portal/login', { waitUntil: 'domcontentloaded' });
  await check(ctx, page, lang, 'portal-login');
  await page.goto(magicLink(), { waitUntil: 'domcontentloaded' });
  await check(ctx, page, lang, 'portal-magic');
  const btn = page.locator('button, a').filter({ hasText: /accedi|entra|continue|continua|sign in|apri/i }).first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(3000); }
  for (const p of ['', '/ped', '/approvals', '/calendar', '/strategy', '/materials', '/reports', '/activities', '/analytics']) {
    await page.goto(BASE + '/portal' + p, { waitUntil: 'domcontentloaded' });
    await check(ctx, page, lang, 'portal' + (p || '-home'));
  }
  await ctx.close();
}

for (const lang of LANGS) {
  await adminSession(lang);
  await portalSession(lang);
}
await browser.close();
const unique = [];
const seen = new Set();
for (const f of findings) {
  const k = f.kind + '|' + f.value;
  if (seen.has(k)) continue;
  seen.add(k);
  unique.push({ ...f, alsoOn: findings.filter((g) => g.kind + '|' + g.value === k).length });
}
writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), screens, findings: unique }, null, 2));
console.log(`screens checked: ${screens.length}; findings: ${findings.length} (${unique.length} distinct)`);
for (const f of unique) console.log(`- [${f.kind}] ${f.value}   @ ${f.where}${f.alsoOn > 1 ? ` (+${f.alsoOn - 1} more)` : ''}`);
process.exit(unique.filter((f) => f.kind !== 'note').length ? 1 : 0);
