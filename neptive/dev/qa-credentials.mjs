// Client credentials QA against the local dev stack (http://localhost:4200, API :3000). Local data only.
// usage: node neptive/dev/qa-credentials.mjs            (all)   |   SHOTS_ONLY=1 ...  (screenshots part only)
// Drives: agency temporary password -> client login -> forced change -> portal; wrong password; throttling
// and its release; change password kills the other session; agency removes the password (login stops, a
// magic link still works); a magic-link-only user unaffected; same email under two customers; direct API
// abuse attempts. Screenshots 1440x900 and 390x844 in neptive/dev/.data/shots/credentials/, log in log.txt.
// Resets only what it creates: credentials of the users it touches, neptive_login_attempts, an extra
// client user (soft-deleted at the end).
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(os.homedir() + '/.local/share/mise/installs/npm-playwright/latest/node_modules/');
const { chromium } = require('playwright');

const BASE = 'http://localhost:4200';
const API = 'http://localhost:3000';
const SHOTS = new URL('./.data/shots/credentials/', import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
const CP = 'fd131113-859b-4d55-9567-4c4d4ce68352'; // Casa Pandora (customer A)
const AURORA = '7233ce6e-bd06-46cd-9d5e-cc53d19cdeec'; // Aurora Gallorini (customer B)
const VIGAR = 'aac4d69a-7445-4521-966a-3a22d3da9903';
const CP_EMAIL = 'cliente@casapandora.it';
const AURORA_EMAIL = 'aurora-demo@neptive.com';
const ALERT = '[role="alert"]:not(#__next-route-announcer__)';
const ORIGIN = { Origin: BASE, 'Content-Type': 'application/json' };

const log = [];
let failures = 0;
const say = (line) => {
  log.push(line);
  console.log(line);
};
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  say(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ' :: ' + detail : ''}`);
};
const sql = (query) =>
  execFileSync('docker', ['exec', 'pzn-postgres', 'psql', '-U', 'postiz-app', '-d', 'postiz-db', '-Atc', query]).toString().trim();
const userId = (customerId, email) =>
  sql(`select id from neptive_client_users where "customerId"='${customerId}' and email='${email}' and "deletedAt" is null`);
const clearAttempts = () => sql('delete from neptive_login_attempts');

// ---------------------------------------------------------------- API helpers (portal, NOT_SECURED header mode)
async function portalLogin(email, password, account) {
  const response = await fetch(`${API}/neptive/portal-auth/login`, {
    method: 'POST',
    headers: ORIGIN,
    body: JSON.stringify({ email, password, ...(account ? { account } : {}) }),
  });
  return { status: response.status, body: await response.json().catch(() => ({})), session: response.headers.get('neptive-portal') };
}
async function portal(session, path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...(session ? { 'neptive-portal': session } : {}), ...(init.headers || {}) },
  });
  const text = await response.text();
  return { status: response.status, text: text.slice(0, 160), session: response.headers.get('neptive-portal') };
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'],
});

async function shot(page, name) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOTS + name + '.png', fullPage: false });
  const text = await page.evaluate(() => document.body.innerText).catch(() => '');
  if (/postiz/i.test(text)) {
    check(`no "Postiz" visible in ${name}`, false);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 0);
  check(`${name}: no horizontal overflow`, overflow <= 1, `scrollWidth - viewport = ${overflow}`);
}

// ---------------------------------------------------------------- agency (admin) session
const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await adminCtx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
const admin = await adminCtx.newPage();
admin.on('pageerror', (e) => say('PAGEERROR admin ' + e.message.slice(0, 200)));
await admin.goto(BASE + '/auth/login', { waitUntil: 'networkidle' });
await admin.fill('input[name="email"]', 'admin@neptive.com');
await admin.fill('input[name="password"]', process.env.ADMIN_PASSWORD || 'neptive-local-admin');
await admin.click('button[type="submit"]');
await admin.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 90000 });
const agencyApi = (path, init = {}) =>
  admin.evaluate(
    async ({ API, path, init }) => {
      const auth = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('auth='))?.slice(5);
      const showorg = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('showorg='))?.slice(8);
      const response = await fetch(API + path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(auth ? { auth } : {}), ...(showorg ? { showorg } : {}), ...(init.headers || {}) },
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    },
    { API, path, init }
  );

const cpUser = userId(CP, CP_EMAIL);
const auroraUser = userId(AURORA, AURORA_EMAIL);
// start clean for the users this script touches
await agencyApi(`/neptive/agency/clients/${CP}/users/${cpUser}/password`, { method: 'DELETE', body: '{}' });
await agencyApi(`/neptive/agency/clients/${AURORA}/users/${auroraUser}/password`, { method: 'DELETE', body: '{}' });
clearAttempts();

// ---------------------------------------------------------------- 1. agency generates a temporary password
await admin.goto(`${BASE}/agency/${CP}/users`, { waitUntil: 'networkidle' });
await shot(admin, '1440-agency-users-before');
const row = admin.locator(`li[data-user="${CP_EMAIL}"]`);
await row.getByRole('button', { name: 'Genera password temporanea' }).click();
await row.locator('code').waitFor({ timeout: 15000 });
const temp = (await row.locator('code').innerText()).trim();
check('temporary password shown once in the panel', /^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/.test(temp), temp.replace(/./g, '•'));
const clip = await admin.evaluate(() => navigator.clipboard.readText()).catch(() => '');
check('temporary password copied to the clipboard', clip === temp);
await shot(admin, '1440-agency-users-temporary-password');
await admin.reload({ waitUntil: 'networkidle' });
check('after a reload the password is gone from the page', !(await admin.locator('body').innerText()).includes(temp));
check('panel shows "Password temporanea" and last login', /Password temporanea[\s\S]*Ultimo accesso/i.test(await row.innerText()));

// ---------------------------------------------------------------- 2. client: login page, wrong password, temp login, forced change
const clientCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const client = await clientCtx.newPage();
client.on('pageerror', (e) => say('PAGEERROR client ' + e.message.slice(0, 200)));
await client.goto(BASE + '/portal/login', { waitUntil: 'networkidle' });
await shot(client, '1440-login-empty');
await client.fill('input[name="email"]', CP_EMAIL);
await client.fill('input[name="password"]', 'non-e-la-password');
await client.click('button[type="submit"]');
await client.locator(ALERT).waitFor();
const wrongText = await client.locator(ALERT).innerText();
check('wrong password: generic error', wrongText.includes('Email o password non corretti'), wrongText);
await shot(client, '1440-login-error');
await client.fill('input[name="email"]', 'nessuno@esempio.it');
await client.fill('input[name="password"]', 'non-e-la-password');
await client.click('button[type="submit"]');
await client.waitForTimeout(1500);
check('unknown email: the same error', (await client.locator(ALERT).innerText()) === wrongText);

await client.fill('input[name="email"]', CP_EMAIL);
await client.fill('input[name="password"]', temp);
await client.click('button[type="submit"]');
await client.waitForURL('**/portal/password', { timeout: 30000 });
check('temporary password -> forced change page', client.url().endsWith('/portal/password'));
await shot(client, '1440-forced-change');
// the restricted session cannot reach portal data, even by URL
const restrictedSession = await client.evaluate(() => document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('neptive_portal='))?.slice(15));
for (const path of ['/neptive/portal/dashboard', '/neptive/portal/peds', '/neptive/portal/approvals', '/neptive/portal/content', `/neptive/portal/peds/e5cfeaf8-ad1a-4fe5-ba88-250efc8010e4`]) {
  const r = await portal(restrictedSession, path);
  check(`temporary-password session GET ${path} refused`, r.status === 403, `${r.status} ${r.text}`);
}
const meRestricted = await portal(restrictedSession, '/neptive/portal/me');
check('temporary-password session can read /me (flagged)', meRestricted.status === 200 && meRestricted.text.includes('"passwordChangeRequired":true'), meRestricted.text);
await client.goto(BASE + '/portal/ped', { waitUntil: 'networkidle' });
await client.waitForURL('**/portal/password', { timeout: 15000 }).catch(() => {});
check('navigating to /portal/ped goes back to the forced change', client.url().endsWith('/portal/password'));

const NEW_PASSWORD = 'Tramonto sul Po 2026';
await client.fill('input[name="new-password"]', 'password123');
await client.fill('input[name="repeat-password"]', 'password123');
await client.click('button[type="submit"]');
await client.locator(ALERT).waitFor();
check('trivial password refused with a clear message', (await client.locator(ALERT).innerText()).includes('troppo facile'));
await client.fill('input[name="new-password"]', NEW_PASSWORD);
await client.fill('input[name="repeat-password"]', NEW_PASSWORD);
await client.click('button[type="submit"]');
await client.waitForURL((u) => u.pathname === '/portal', { timeout: 30000 });
check('after the change the client lands in the portal', new URL(client.url()).pathname === '/portal');
await client.waitForTimeout(2500);
const homeText = await client.locator('body').innerText();
const me = await client.evaluate(async (API) => {
  const s = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('neptive_portal='))?.slice(15);
  return (await fetch(API + '/neptive/portal/me', { headers: { 'neptive-portal': s } })).json();
}, API);
check('portal session is Casa Pandora', me.customerId === CP && me.hasPassword && !me.passwordTemporary && !me.passwordChangeRequired, JSON.stringify(me));
check('home shows the Casa Pandora greeting', /Ciao/i.test(homeText), homeText.slice(0, 80).replace(/\s+/g, ' '));
await client.goto(BASE + '/portal/ped', { waitUntil: 'networkidle' });
await client.waitForTimeout(2000);
const pedText = await client.locator('body').innerText();
check('portal PED lists only Casa Pandora content (no Aurora slot)', !/New Life/.test(pedText) && pedText.length > 200);
await client.goto(BASE + '/portal/account', { waitUntil: 'networkidle' });
await shot(client, '1440-account');

// ---------------------------------------------------------------- 3. the old temporary password is dead; second session; change kills it
check('temporary password no longer works', (await portalLogin(CP_EMAIL, temp)).status === 401);
const second = await portalLogin(CP_EMAIL, NEW_PASSWORD);
check('second session with the new password', second.status === 200 && !!second.session, JSON.stringify(second.body));
check('second session reads the PED', (await portal(second.session, '/neptive/portal/peds')).status === 200);
await client.fill('input[name="current-password"]', NEW_PASSWORD);
const NEWER = 'Nebbia in Val Padana 7';
await client.fill('input[name="new-password"]', NEWER);
await client.fill('input[name="repeat-password"]', NEWER);
await client.click('button[type="submit"]');
await client.getByRole('status').waitFor({ timeout: 20000 });
check('account page: password changed message', (await client.getByRole('status').innerText()).includes('Password cambiata'));
await shot(client, '1440-account-changed');
const afterChange = await portal(second.session, '/neptive/portal/peds');
check('the other session died after the change', afterChange.status === 401, `${afterChange.status}`);
await client.goto(BASE + '/portal', { waitUntil: 'networkidle' });
check('the browser that changed it is still in', new URL(client.url()).pathname === '/portal');

// ---------------------------------------------------------------- 4. throttling and its release
clearAttempts();
const t = [];
for (let i = 0; i < 5; i++) t.push((await portalLogin(CP_EMAIL, 'sbagliata-' + i)).status);
const blocked = await portalLogin(CP_EMAIL, NEWER);
check('5 wrong passwords -> 401 x5, then 429 even with the right one', t.join(',') === '401,401,401,401,401' && blocked.status === 429, `${t.join(',')} then ${blocked.status} retryAfter=${blocked.body.retryAfter}`);
const throttledCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const throttledPage = await throttledCtx.newPage();
await throttledPage.goto(BASE + '/portal/login', { waitUntil: 'networkidle' });
await throttledPage.fill('input[name="email"]', CP_EMAIL);
await throttledPage.fill('input[name="password"]', NEWER);
await throttledPage.click('button[type="submit"]');
await throttledPage.locator(ALERT).waitFor();
check('browser shows the throttled message', (await throttledPage.locator(ALERT).innerText()).includes('Troppi tentativi'));
await shot(throttledPage, '1440-login-throttled');
const activity = sql(`select count(*) from neptive_activities where "customerId"='${CP}' and type='CLIENT_LOGIN_THROTTLED' and "occurredAt" > now() - interval '5 minutes'`);
check('throttling recorded in the activity log', Number(activity) >= 1, activity);
// 15 minutes later (the stored failures are moved back in time: same effect as waiting)
sql(`update neptive_login_attempts set "createdAt" = "createdAt" - interval '15 minutes 1 second'`);
const released = await portalLogin(CP_EMAIL, NEWER);
check('after the 15-minute window the right password works again', released.status === 200, `${released.status}`);
clearAttempts();

// ---------------------------------------------------------------- 5. agency removes the password; magic link still works
await admin.goto(`${BASE}/agency/${CP}/users`, { waitUntil: 'networkidle' });
const cpRow = admin.locator(`li[data-user="${CP_EMAIL}"]`);
check('panel: password set by the client, never shown', /Password impostata[\s\S]*Neptive non la conosce/i.test(await cpRow.innerText()) && !(await cpRow.innerText()).includes(NEWER));
await shot(admin, '1440-agency-users');
await cpRow.getByRole('button', { name: 'Rimuovi password' }).click();
await admin.locator('.bg-popup').getByRole('button', { name: 'Rimuovi password' }).click();
await admin.waitForTimeout(2000);
check('after removal the row says "Nessuna password"', /Nessuna password/i.test(await cpRow.innerText()));
check('password login stops working', (await portalLogin(CP_EMAIL, NEWER)).status === 401);
const clientAfterRemove = await client.evaluate(async (API) => {
  const s = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('neptive_portal='))?.slice(15);
  return (await fetch(API + '/neptive/portal/me', { headers: { 'neptive-portal': s } })).status;
}, API);
check('removing the password ended the open session', clientAfterRemove === 401, `${clientAfterRemove}`);
await cpRow.getByRole('button', { name: 'Genera link di accesso' }).click();
await cpRow.locator('code').waitFor({ timeout: 15000 });
const link = (await cpRow.locator('code').innerText()).trim();
check('access link generated and shown', link.startsWith(BASE + '/portal/magic/'));
const magicCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const magic = await magicCtx.newPage();
await magic.goto(link, { waitUntil: 'networkidle' });
await magic.getByRole('button', { name: /Continua/ }).click();
await magic.waitForURL((u) => u.pathname === '/portal', { timeout: 30000 });
check('magic link still logs in', new URL(magic.url()).pathname === '/portal');
await magic.goto(BASE + '/portal/account', { waitUntil: 'networkidle' });
await magic.waitForTimeout(1500);
check('magic-link session: account page offers to set a password', /Imposta una password/i.test(await magic.locator('body').innerText()));

// ---------------------------------------------------------------- 6. magic-link-only user unaffected (Aurora)
const aLink = await agencyApi(`/neptive/agency/clients/${AURORA}/users`, { method: 'POST', body: JSON.stringify({ email: AURORA_EMAIL, name: 'Aurora' }) });
const aCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const aPage = await aCtx.newPage();
await aPage.goto(aLink.body.url, { waitUntil: 'networkidle' });
await aPage.getByRole('button', { name: /Continua/ }).click();
await aPage.waitForURL((u) => u.pathname === '/portal', { timeout: 30000 });
await aPage.goto(BASE + '/portal/ped', { waitUntil: 'networkidle' });
await aPage.waitForTimeout(2500);
const aText = await aPage.locator('body').innerText();
check('magic-link-only user (Aurora): straight into the portal, her PED, no forced step', new URL(aPage.url()).pathname === '/portal/ped' && /New Life/.test(aText));

// ---------------------------------------------------------------- 7. same email under two customers
// a previous run soft-deleted this QA user; inviting the same email again would hit the unique key
// (orgId, customerId, email) - pre-existing behaviour of inviteUser, see the report - so revive it (local DB)
sql(`update neptive_client_users set "deletedAt" = null where "customerId"='${VIGAR}' and email='${CP_EMAIL}'`);
const dup = await agencyApi(`/neptive/agency/clients/${VIGAR}/users`, { method: 'POST', body: JSON.stringify({ email: CP_EMAIL, name: 'Stessa email (QA)' }) });
const dupId = dup.body.id;
const tA = await agencyApi(`/neptive/agency/clients/${CP}/users/${cpUser}/temporary-password`, { method: 'POST', body: '{}' });
const tB = await agencyApi(`/neptive/agency/clients/${VIGAR}/users/${dupId}/temporary-password`, { method: 'POST', body: '{}' });
const inA = await portalLogin(CP_EMAIL, tA.body.password);
const inB = await portalLogin(CP_EMAIL, tB.body.password);
const meA = await portal(inA.session, '/neptive/portal/me');
const meB = await portal(inB.session, '/neptive/portal/me');
check('same email, password of customer A -> customer A', meA.text.includes(CP), meA.text);
check('same email, password of customer B -> customer B', meB.text.includes(VIGAR), meB.text);
const SAME = 'Stessa frase per due 9';
const setA = await portal(inA.session, '/neptive/portal/account/password', { method: 'POST', headers: ORIGIN, body: JSON.stringify({ newPassword: SAME }) });
const setB = await portal(inB.session, '/neptive/portal/account/password', { method: 'POST', headers: ORIGIN, body: JSON.stringify({ newPassword: SAME }) });
check('both set the same password', setA.status === 200 && setB.status === 200, `${setA.status} ${setB.status}`);
const choose = await portalLogin(CP_EMAIL, SAME);
check('same password on both -> chooser with both names, no session yet', !!choose.body.chooseAccount && choose.body.chooseAccount.length === 2 && !choose.session, JSON.stringify(choose.body));
const chooseCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const chooser = await chooseCtx.newPage();
await chooser.goto(BASE + '/portal/login', { waitUntil: 'networkidle' });
await chooser.fill('input[name="email"]', CP_EMAIL);
await chooser.fill('input[name="password"]', SAME);
await chooser.click('button[type="submit"]');
await chooser.getByText(/Quale spazio apri/i).waitFor({ timeout: 15000 });
await shot(chooser, '1440-login-choose');
await chooser.getByRole('button', { name: /Vigar2/ }).click();
await chooser.waitForURL((u) => u.pathname === '/portal', { timeout: 30000 });
const chosenMe = await chooser.evaluate(async (API) => {
  const s = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('neptive_portal='))?.slice(15);
  return (await fetch(API + '/neptive/portal/me', { headers: { 'neptive-portal': s } })).json();
}, API);
check('chooser: picking Vigar2 opens Vigar2 only', chosenMe.customerId === VIGAR, chosenMe.customerId);
const wrongChoice = await portalLogin(CP_EMAIL, 'sbagliata sbagliata');
check('wrong password never shows the chooser', wrongChoice.status === 401 && !wrongChoice.body.chooseAccount);
// cleanup of the QA user
await agencyApi(`/neptive/agency/clients/${VIGAR}/users/${dupId}`, { method: 'DELETE', body: '{}' });
clearAttempts();

// ---------------------------------------------------------------- 8. direct API abuse
const aSession = (await portalLogin(CP_EMAIL, SAME)).session;
check('(setup) customer A password session', !!aSession);
// customer B's rows, looked up (qa-variants.mjs re-seeds Aurora's approvals)
const B_PED = sql(`select id from neptive_editorial_plans where "customerId"='${AURORA}' and "deletedAt" is null order by "createdAt" limit 1`);
const B_APPR = sql(`select id from neptive_content_approvals where "customerId"='${AURORA}' and "deletedAt" is null and status='PENDING_CLIENT_APPROVAL' order by "createdAt" limit 1`);
check('(setup) customer B has a plan and a pending approval', !!B_PED && !!B_APPR, `${B_PED} ${B_APPR}`);
for (const [method, path, body] of [
  ['GET', `/neptive/portal/peds/${B_PED}`],
  ['GET', `/neptive/portal/approvals/${B_APPR}`],
  ['POST', `/neptive/portal/approvals/${B_APPR}/transition`, { status: 'CHANGES_REQUESTED', comment: 'QA cross-customer' }],
  ['POST', `/neptive/portal/approvals/${B_APPR}/comments`, { body: 'QA cross-customer' }],
  ['POST', `/neptive/portal/peds/${B_PED}/transition`, { status: 'CHANGES_REQUESTED', comment: 'QA' }],
  ['GET', `/neptive/agency/clients/${AURORA}`],
]) {
  const r = await portal(aSession, path, { method, headers: ORIGIN, ...(body ? { body: JSON.stringify(body) } : {}) });
  check(`A's password session ${method} ${path} refused`, [401, 403, 404].includes(r.status), `${r.status} ${r.text}`);
}
const lists = await portal(aSession, `/neptive/portal/peds?customerId=${AURORA}`);
check('A session with ?customerId=B still lists only A', lists.status === 200 && !lists.text.includes(AURORA) , lists.text.slice(0, 80));
const bApprStatus = sql(`select status from neptive_content_approvals where id='${B_APPR}'`);
check("B's approval untouched", bApprStatus === 'PENDING_CLIENT_APPROVAL', bApprStatus);
const noSession = await portal(null, '/neptive/portal/account/password', { method: 'POST', headers: ORIGIN, body: JSON.stringify({ newPassword: 'Qualunque cosa 123' }) });
check('set-password without a session -> 401', noSession.status === 401, `${noSession.status} ${noSession.text}`);
const crossSite = await portal(aSession, '/neptive/portal/account/password', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: SAME, newPassword: 'Qualunque cosa 123' }) });
check('set-password from another origin -> 403', crossSite.status === 403, `${crossSite.status} ${crossSite.text}`);
const formPost = await portal(aSession, '/neptive/portal/account/password', { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'newPassword=Qualunque+cosa+123' });
check('set-password as an HTML form post -> 403', formPost.status === 403, `${formPost.status} ${formPost.text}`);
// every mutating portal route: refused cross-site / as a form / without Origin, and the same request from the
// portal origin reaches the handler (a business answer, never the CSRF refusal). Customer B (Aurora) has the
// approvals; the transition asks for DRAFT, which a client may never set (business 403 'Forbidden', nothing
// changes); the real approve-from-the-right-origin path is schedule-check.mjs.
{
  const CSRF = /Cross-site request refused|JSON body required|Origin required/;
  const refused = (r) => r.status === 403 && CSRF.test(r.text);
  const reached = (r) => !CSRF.test(r.text);
  const magicToken = async (customerId, email, name) =>
    (await agencyApi(`/neptive/agency/clients/${customerId}/users`, { method: 'POST', body: JSON.stringify({ email, name }) })).body.url.split('/').pop();
  const bConsume = await fetch(`${API}/neptive/portal-auth/magic`, { method: 'POST', headers: ORIGIN, body: JSON.stringify({ token: await magicToken(AURORA, AURORA_EMAIL, 'Aurora') }) });
  const bSession = bConsume.headers.get('neptive-portal');
  const PED_A = sql(`select id from neptive_editorial_plans where "customerId"='${CP}' and "deletedAt" is null order by "createdAt" limit 1`);
  const routes = [
    ['approval transition', `/neptive/portal/approvals/${B_APPR}/transition`, () => ({ status: 'DRAFT' }), bSession],
    ['approval comment', `/neptive/portal/approvals/${B_APPR}/comments`, () => ({ body: 'QA: controllo CSRF (locale)' }), bSession],
    ['PED transition', `/neptive/portal/peds/${PED_A}/transition`, () => ({ status: 'DRAFT' }), aSession],
    ['magic-link consumption', '/neptive/portal-auth/magic', async () => ({ token: await magicToken(CP, CP_EMAIL, 'Casa Pandora') }), null],
    ['logout', '/neptive/portal-auth/logout', () => ({}), null],
  ];
  for (const [what, path, bodyOf, session] of routes) {
    const body = await bodyOf();
    const cross = await portal(session, path, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const form = await portal(session, path, { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
    const bare = await portal(session, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const right = await portal(session, path, { method: 'POST', headers: ORIGIN, body: JSON.stringify(body) });
    check(`CSRF ${what}: cross-site ${cross.status}, form ${form.status}, no Origin ${bare.status} (refused); same origin ${right.status} (reached the handler)`,
      refused(cross) && refused(form) && refused(bare) && reached(right), right.text.slice(0, 110));
  }
  check("B's approval still pending after the CSRF checks", sql(`select status from neptive_content_approvals where id='${B_APPR}'`) === 'PENDING_CLIENT_APPROVAL');
}
const loginCross = await fetch(`${API}/neptive/portal-auth/login`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: CP_EMAIL, password: SAME }) });
check('login from another origin -> 403 (login CSRF)', loginCross.status === 403, `${loginCross.status}`);
const tempAgain = await agencyApi(`/neptive/agency/clients/${CP}/users/${cpUser}/temporary-password`, { method: 'POST', body: '{}' });
const tempSession = (await portalLogin(CP_EMAIL, tempAgain.body.password)).session;
for (const [method, path, body] of [
  ['GET', '/neptive/portal/dashboard'],
  ['GET', '/neptive/portal/approvals'],
  ['POST', `/neptive/portal/approvals/${B_APPR}/transition`, { status: 'APPROVED' }],
  ['GET', '/neptive/portal/reports'],
]) {
  const r = await portal(tempSession, path, { method, headers: ORIGIN, ...(body ? { body: JSON.stringify(body) } : {}) });
  check(`temporary-password session ${method} ${path} -> 403`, r.status === 403, `${r.status} ${r.text}`);
}
const portalAsAgency = await portal(aSession, `/neptive/agency/clients/${CP}/users/${cpUser}/temporary-password`, { method: 'POST', headers: ORIGIN, body: '{}' });
check('portal session cannot call agency password endpoints', portalAsAgency.status === 401 || portalAsAgency.status === 403, `${portalAsAgency.status}`);
const agencyCross = await agencyApi(`/neptive/agency/clients/${AURORA}/users/${cpUser}/temporary-password`, { method: 'POST', body: '{}' });
check('agency: user of customer A through customer B URL -> 404', agencyCross.status === 404, `${agencyCross.status}`);
const projection = await agencyApi(`/neptive/agency/clients/${CP}`);
check('agency client detail carries no hash', !JSON.stringify(projection.body).match(/\$2[aby]\$|passwordHash/), Object.keys(projection.body.users?.[0] || {}).join(','));

// ---------------------------------------------------------------- 8b. a removed customer loses its sessions
{
  const created = await agencyApi('/neptive/agency/clients', { method: 'POST', body: JSON.stringify({ name: `QA rimosso ${Date.now()}` }) });
  const gone = created.body.id;
  const invited = await agencyApi(`/neptive/agency/clients/${gone}/users`, { method: 'POST', body: JSON.stringify({ email: 'qa-removed@neptive.local', name: 'QA rimosso' }) });
  const consume = await fetch(`${API}/neptive/portal-auth/magic`, { method: 'POST', headers: ORIGIN, body: JSON.stringify({ token: invited.body.url.split('/').pop() }) });
  const goneSession = consume.headers.get('neptive-portal');
  const before = await portal(goneSession, '/neptive/portal/content?state=all');
  check('(setup) session of a throwaway customer reads /content', before.status === 200, `${before.status}`);
  // the customer row soft-deleted directly (as a stale row would be), sessions NOT revoked: resolve() alone must refuse
  sql(`update "Customer" set "deletedAt" = now() where id = '${gone}'`);
  for (const path of ['/neptive/portal/me', '/neptive/portal/content?state=all', '/neptive/portal/dashboard']) {
    const r = await portal(goneSession, path);
    check(`soft-deleted customer: GET ${path} -> 401`, r.status === 401, `${r.status}`);
  }
  sql(`update "Customer" set "deletedAt" = null where id = '${gone}'`);
  check('(setup) customer back: the same session works again', (await portal(goneSession, '/neptive/portal/me')).status === 200);
  const removed = await agencyApi(`/neptive/agency/clients/${gone}`, { method: 'DELETE', body: '{}' });
  const revoked = sql(`select count(*) filter (where "revokedAt" is null) from neptive_portal_sessions where "customerId" = '${gone}'`);
  check('agency deletes the customer: its sessions are revoked', removed.status === 200 && revoked === '0', `${removed.status}, live sessions ${revoked}`);
  sql(`update "Customer" set "deletedAt" = null where id = '${gone}'`);
  check('revoked sessions stay dead even if the customer row came back', (await portal(goneSession, '/neptive/portal/me')).status === 401);
  sql(`update "Customer" set "deletedAt" = now() where id = '${gone}'`);
}

// leave Casa Pandora as found: no password
await agencyApi(`/neptive/agency/clients/${CP}/users/${cpUser}/password`, { method: 'DELETE', body: '{}' });
clearAttempts();

// ---------------------------------------------------------------- 9. mobile screenshots (390x844)
{
  const temp390 = (await agencyApi(`/neptive/agency/clients/${CP}/users/${cpUser}/temporary-password`, { method: 'POST', body: '{}' })).body.password;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE + '/portal/login', { waitUntil: 'networkidle' });
  await shot(page, '390-login-empty');
  await page.fill('input[name="email"]', CP_EMAIL);
  await page.fill('input[name="password"]', 'non-e-la-password');
  await page.click('button[type="submit"]');
  await page.locator(ALERT).waitFor();
  await page.locator(ALERT).scrollIntoViewIfNeeded();
  await shot(page, '390-login-error');
  await page.fill('input[name="password"]', temp390);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/portal/password', { timeout: 30000 });
  await shot(page, '390-forced-change');
  await page.fill('input[name="new-password"]', 'Lucciole a giugno 44');
  await page.fill('input[name="repeat-password"]', 'Lucciole a giugno 44');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => u.pathname === '/portal', { timeout: 30000 });
  await page.goto(BASE + '/portal/account', { waitUntil: 'networkidle' });
  await shot(page, '390-account');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, '390-account-form');
  await ctx.close();
  const actx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, storageState: await adminCtx.storageState() });
  const ap = await actx.newPage();
  await ap.goto(`${BASE}/agency/${CP}/users`, { waitUntil: 'networkidle' });
  await ap.waitForTimeout(2000);
  await ap.locator(`li[data-user="${CP_EMAIL}"]`).scrollIntoViewIfNeeded();
  await shot(ap, '390-agency-users');
  await actx.close();
  await agencyApi(`/neptive/agency/clients/${CP}/users/${cpUser}/password`, { method: 'DELETE', body: '{}' });
}

clearAttempts();
await browser.close();
say(`\n${failures ? failures + ' FAILED' : 'all checks passed'}`);
fs.writeFileSync(SHOTS + 'log.txt', log.join('\n') + '\n');
process.exit(failures ? 1 : 0);
