// Browser QA for post variants (LOCAL ONLY). usage: node neptive/dev/qa-variants.mjs [quick]
// Re-seeds the Aurora demo slot (seed-variants.sh), then drives agency + client at 1440x900 and 390x844 and
// saves screenshots to neptive/dev/.data/shots/variants/. Also checks through the API that a receded
// variant refuses decisions and comments. Needs the local stack (stack.sh up + app) and system chromium.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';

const require = createRequire(os.homedir() + '/.local/share/mise/installs/npm-playwright/latest/node_modules/');
const { chromium } = require('playwright');
const ROOT = new URL('../../', import.meta.url).pathname;
const SHOTS = process.env.PZN_SHOTS || new URL('./.data/shots/variants/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
// env overrides let the same script drive the production image (see neptive/DEPLOY.md): PZN_BASE=https://portal.neptive.com
// PZN_API=https://127.0.0.1:8443/api PZN_DB=rehearsal PZN_HOST_RULES='MAP portal.neptive.com 127.0.0.1:8443' PZN_SHOTS=<dir>
const BASE = process.env.PZN_BASE || 'http://localhost:4200';
const API = process.env.PZN_API || 'http://localhost:3000';
const DB = process.env.PZN_DB || 'postiz-db';
const ORG = 'd6d585e7-d225-4225-9f96-d8b595c53d72';
const AURORA = '7233ce6e-bd06-46cd-9d5e-cc53d19cdeec';
const AURORA_USER = '4ba46056-00e2-46e0-8627-42b47b46184b';
const ITEM = '5eed0000-0000-4000-8000-000000000001';
const quick = process.argv[2] === 'quick';
const log = [];
const say = (line) => { log.push(line); console.log(line); };

const psql = (sql) =>
  execFileSync('docker', ['exec', '-i', 'pzn-postgres', 'psql', '-U', 'postiz-app', '-d', DB, '-At', '-c', sql]).toString().trim();
const seed = () => execFileSync(ROOT + 'neptive/dev/seed-variants.sh', { stdio: 'pipe', env: { ...process.env, PZN_DB: DB } }).toString();
function magicLink() {
  const token = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  psql(`insert into neptive_magic_links(id,"tokenHash","clientUserId","customerId","orgId","expiresAt") values (gen_random_uuid()::text,'${hash}','${AURORA_USER}','${AURORA}','${ORG}', now() + interval '1 hour')`);
  return token;
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', ...(process.env.PZN_HOST_RULES ? [`--host-resolver-rules=${process.env.PZN_HOST_RULES}`] : [])],
});
{ const open = browser.newContext.bind(browser); browser.newContext = (options = {}) => open({ ignoreHTTPSErrors: true, ...options }); }

async function settle(page, ms = 1500) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}
async function shot(page, name, opts = {}) {
  await settle(page, opts.wait ?? 1200);
  await page.screenshot({ path: SHOTS + name + '.png', fullPage: !!opts.full });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  say(`shot ${name}.png  horizontal overflow: ${overflow}px`);
}
const slot = (page) => page.locator(`#slot-${ITEM}`);
async function slotTop(page) {
  await slot(page).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8));
  await page.waitForTimeout(400);
}
const tab = (page, label) => slot(page).getByRole('tab', { name: new RegExp(`^Variante ${label}:`) });

async function clientSession(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => say('PAGEERROR ' + e.message.slice(0, 200)));
  page.on('console', (m) => m.type() === 'error' && say('CONSOLE client ' + m.text().slice(0, 300)));
  await page.goto(`${BASE}/portal/magic/${magicLink()}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /continue|continua/i }).click();
  await page.waitForURL(/\/portal$/, { timeout: 30000 }).catch(() => {});
  return { ctx, page };
}

async function agencySession(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => say('PAGEERROR ' + e.message.slice(0, 200)));
  page.on('console', (m) => m.type() === 'error' && say('CONSOLE agency ' + m.text().slice(0, 300)));
  await page.goto(BASE + '/auth/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', 'admin@neptive.com');
  await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD || 'neptive-local-admin');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60000 }).catch(() => {});
  return { ctx, page };
}

async function openAgencySlot(page) {
  await page.goto(`${BASE}/agency/${AURORA}/ped`, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  // dev-only CopilotKit inspector popups cover the modal in screenshots
  const hide = page.getByText('Hide Inspector for a day');
  if (await hide.count()) await hide.first().click().catch(() => {});
  await page.getByRole('button', { name: /Reel — New Life: quale montaggio\?/ }).first().click();
  await slot(page).waitFor();
}

async function apiRefusals() {
  // a fresh portal session straight against the API, no UI
  const consume = await fetch(`${API}/neptive/portal-auth/magic`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: magicLink() }),
  });
  const headers = { 'content-type': 'application/json', 'neptive-portal': consume.headers.get('neptive-portal') };
  const peds = await (await fetch(`${API}/neptive/portal/peds`, { headers })).json();
  const item = peds.flatMap((ped) => ped.items).find((entry) => entry.id === ITEM);
  // prefer a receded variant whose own approval is still pending: only the slot rule can refuse it
  const receded =
    item.variants.find((variant) => variant.state === 'NOT_CHOSEN' && variant.approval?.status === 'PENDING_CLIENT_APPROVAL') ||
    item.variants.find((variant) => variant.state === 'NOT_CHOSEN');
  const tries = [
    ['approve', `/neptive/portal/approvals/${receded.approval.id}/transition`, { status: 'APPROVED' }],
    ['request changes', `/neptive/portal/approvals/${receded.approval.id}/transition`, { status: 'CHANGES_REQUESTED', comment: 'via API' }],
    ['comment', `/neptive/portal/approvals/${receded.approval.id}/comments`, { body: 'via API' }],
  ];
  for (const [what, path, body] of tries) {
    const response = await fetch(API + path, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    say(`API ${what} on receded variant ${receded.label}: HTTP ${response.status} ${data.message || ''}`);
  }
}

for (const [suffix, viewport] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]) {
  if (quick && suffix === '390') break;
  say(`---- ${suffix}: ${seed().split('\n').filter((line) => line.includes('agency view')).join('')}`);
  const mobile = viewport.width < 500;

  // agency: the slot with its four variants, then attach E and remove it again
  const agency = await agencySession({ width: 1440, height: 900, ...(mobile ? viewport : {}) });
  await openAgencySlot(agency.page);
  await shot(agency.page, `${suffix}-01-agency-slot`);
  if (!mobile) {
    await slot(agency.page).locator('select').selectOption('5eed6000-0000-4000-8000-00000000000e');
    await slot(agency.page).getByRole('button', { name: '+ Variante' }).click();
    await tab(agency.page, 'E').waitFor({ timeout: 15000 });
    await shot(agency.page, `${suffix}-02-agency-attached-E`);
    agency.page.once('dialog', (dialog) => dialog.accept());
    await slot(agency.page).getByRole('button', { name: 'Rimuovi' }).click();
    await tab(agency.page, 'E').waitFor({ state: 'detached', timeout: 15000 });
    say('agency: attached E then removed it');
  }

  // client
  const client = await clientSession(viewport);
  const page = client.page;
  await page.goto(`${BASE}/portal/ped`, { waitUntil: 'networkidle' });
  await shot(page, `${suffix}-10-portal-post-list`, { wait: 2500 });
  if (!quick) await shot(page, `${suffix}-10b-portal-post-list-full`, { full: true });
  await slotTop(page);
  await shot(page, `${suffix}-11-slot-before-decision`);

  // request changes on A
  await tab(page, 'A').click();
  await slot(page).getByRole('button', { name: 'Richiedi modifiche' }).click();
  await slot(page).getByLabel(/Cosa vuoi cambiare/).fill('Taglia i primi tre secondi e usa la seconda copertina.');
  await slot(page).getByRole('button', { name: 'Invia richiesta' }).click();
  await slot(page).getByRole('tab', { name: /^Variante A: Modifiche richieste/ }).waitFor({ timeout: 15000 });
  await slotTop(page);
  await shot(page, `${suffix}-12-after-changes-requested`);

  // comment on C, approve B
  await tab(page, 'C').click();
  await slot(page).getByPlaceholder(/commento sulla variante C/).fill('Questa luce mi piace molto.');
  await slot(page).getByRole('button', { name: 'Invia commento' }).click();
  await page.waitForTimeout(1200);
  await tab(page, 'B').click();
  if (mobile) {
    // mid-preview: the sticky decision bar must be on screen, at the bottom
    await slotTop(page);
    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(500);
    const bar = await slot(page).getByRole('button', { name: 'Approva B' }).boundingBox();
    say(`mobile: "Approva B" button box y=${Math.round(bar?.y ?? -1)} h=${Math.round(bar?.height ?? 0)} (viewport ${viewport.height})`);
    await shot(page, `${suffix}-13-actions-thumb-reach`);
  }
  await slot(page).getByRole('button', { name: 'Approva B' }).click();
  await slot(page).getByRole('tab', { name: /^Variante B: Variante confermata/ }).waitFor({ timeout: 15000 });
  await slotTop(page);
  await shot(page, `${suffix}-14-after-confirmation`);
  await tab(page, 'C').click();
  await slotTop(page);
  await shot(page, `${suffix}-15-receded-variant`);
  const actionsOnReceded = await slot(page).getByRole('button', { name: /Approva|Richiedi modifiche|Invia commento/ }).count();
  say(`client UI: action buttons on receded variant C = ${actionsOnReceded}`);

  await apiRefusals();

  // agency sees the decision and reopens
  await openAgencySlot(agency.page);
  await shot(agency.page, `${suffix}-20-agency-after-confirmation`);
  agency.page.once('dialog', (dialog) => dialog.accept('Il cliente vuole rivedere la scelta'));
  await slot(agency.page).getByRole('button', { name: 'Riapri la scelta' }).click();
  await slot(agency.page).getByRole('tab', { name: /^Variante B: Da valutare/ }).waitFor({ timeout: 15000 });
  await shot(agency.page, `${suffix}-21-agency-after-reopen`);
  say(`after reopen: ${psql(`select string_agg(v.label || '=' || a.status, ' ' order by v.position) from neptive_plan_item_variants v join neptive_content_approvals a on a."postGroup" = v."postGroup" where v."itemId" = '${ITEM}' and v."removedAt" is null`)}`);
  await page.reload({ waitUntil: 'networkidle' });
  await slotTop(page);
  await shot(page, `${suffix}-16-client-after-reopen`);

  await client.ctx.close();
  await agency.ctx.close();
}

// legacy single-post items render as before: one shot of a single item in the feed
{
  const client = await clientSession({ width: 1440, height: 900 });
  await client.page.goto(`${BASE}/portal/ped`, { waitUntil: 'networkidle' });
  await client.page.locator('article').first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8));
  await shot(client.page, '1440-30-single-post-item');
  await client.ctx.close();
}
await browser.close();
say('done');
(await import('node:fs')).writeFileSync(SHOTS + 'qa-log.txt', log.join('\n') + '\n');
