#!/usr/bin/env node
// LOCAL ONLY. End-to-end check of "approval schedules the post" against the local stack:
// real backend (:3000, dev), real local Temporal (pzn-temporal), local DB (pzn-postgres).
// The orchestrator is NOT running, so a started post workflow just sits RUNNING: nothing
// is ever published (and integration tokens in the local DB are dummies anyway).
//
// usage: node neptive/dev/schedule-check.mjs            (needs: stack.sh up + stack.sh app)
//        SKIP_TEMPORAL_DOWN=1 node neptive/dev/schedule-check.mjs
//
// Scenarios: variant approved (IG + FB) -> only its posts QUEUE + workflows RUNNING; a second
// approval is refused and creates no workflow; reopen -> DRAFT + workflows gone; passed date ->
// moved to the next same Rome hour; Temporal stopped -> approval OK, posts DRAFT, agency activity;
// single-content PED item -> scheduled too. Leaves the variants demo re-seeded and every
// workflow it started terminated.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const API = process.env.PZN_API || 'http://localhost:3000';
// portal mutations must come from the portal origin (CSRF rule, neptive/docs/client-credentials.md)
const ORIGIN = new URL(process.env.PZN_BASE || 'http://localhost:4200').origin;
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).replace(/^"|"$/g, '')])
);
if (!/(127\.0\.0\.1|localhost):55432/.test(env.DATABASE_URL || '')) {
  console.error('refusing: DATABASE_URL is not the local pzn-postgres');
  process.exit(1);
}

const ORG = 'd6d585e7-d225-4225-9f96-d8b595c53d72';
const AURORA = '7233ce6e-bd06-46cd-9d5e-cc53d19cdeec';
const PLAN = '8565dcbd-66c9-45ab-806f-7d6e971a9393';
const ITEM = '5eed0000-0000-4000-8000-000000000001';
const LEGACY_ITEM = '5eed0000-0000-4000-8000-000000000002';
const IG = 'abdd89db-9823-4d67-ae5b-2b1f95df6135';
const FB = '5eed2000-0000-4000-8000-0000000000fb';
const G = (letter) => `5eed6000-0000-4000-8000-00000000000${letter}`;
const P = (letter) => `5eed1000-0000-4000-8000-00000000000${letter}`;
// The Facebook twins deliberately share hyphen tokens ("4000", "8000") with the seed ids: Postiz
// looks running workflows up with postId="<id>" on a TEXT search attribute (full-text, any token
// matches). Before the posts.service.ts guard (see UPSTREAM-SYNC "Deliberate divergences") starting
// one of them terminated the others; scenario 5 checks that it no longer does.
const FB_A = 'fa0c1d2e-3b4a-4000-8000-7c8d9e0f1a2b';
const FB_B = 'fb1d2e3f-4c5b-4000-8000-8d9e0f1a2b3c';

let failures = 0;
const check = (ok, what, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${extra ? `  (${extra})` : ''}`);
};
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });
const sql = (query) =>
  sh('docker', ['exec', '-i', 'pzn-postgres', 'psql', '-U', 'postiz-app', '-d', 'postiz-db', '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|'], {
    input: query,
  }).trim();
const temporal = (...args) => sh('docker', ['exec', 'pzn-temporal', 'temporal', ...args, '--address', 'pzn-temporal:7233']);
const workflowStatus = (postId) => {
  try {
    return JSON.parse(temporal('workflow', 'describe', '-w', `post_${postId}`, '-o', 'json')).workflowExecutionInfo.status;
  } catch {
    return 'NOT_FOUND';
  }
};
// exact WorkflowId (not postId: TEXT attribute, fuzzy); visibility lags, so poll a little
const runningCount = async (postId) => {
  let count;
  for (let i = 0; i < 10; i++) {
    count = temporal('workflow', 'count', '-q', `WorkflowId="post_${postId}" AND ExecutionStatus="Running"`).match(/\d+/)?.[0];
    if (count === '1') break;
    await sleep(1000);
  }
  return count;
};
const states = () =>
  Object.fromEntries(
    sql(`select id, state from "Post" where (id like '5eed1000-%' or "integrationId" = '${FB}') and "deletedAt" is null order by id`)
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('|'))
  );
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RUNNING = 'WORKFLOW_EXECUTION_STATUS_RUNNING';
const runId = (postId) => {
  try {
    return JSON.parse(temporal('workflow', 'describe', '-w', `post_${postId}`, '-o', 'json')).workflowExecutionInfo.execution.runId;
  } catch {
    return null;
  }
};
// runs of post_<id> started after `since` (visibility lags: give it a few seconds)
const runsSince = async (postId, since) => {
  await sleep(4000);
  return Number(
    temporal('workflow', 'count', '-q', `WorkflowId="post_${postId}" AND StartTime > "${since}"`).match(/\d+/)?.[0]
  );
};
async function agencyCall(headers, method, path, body) {
  const response = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return response.status;
}

function seed() {
  const out = sh('bash', ['neptive/dev/seed-variants.sh']);
  const token = out.match(/portal\/magic\/([0-9a-f]+)/)[1];
  sql(`
    begin;
    delete from neptive_editorial_plan_items where id = '${LEGACY_ITEM}';
    delete from "Post" where "integrationId" = '${FB}';
    update "Post" set state = 'DRAFT' where id like '5eed1000-%';
    insert into "Post"(id, state, "publishDate", "organizationId", "integrationId", content, "group", title, settings, image, "createdAt", "updatedAt")
    select '${FB_A}', 'DRAFT', "publishDate", "organizationId", '${FB}', content, "group", title, '{"__type":"facebook"}', image, now(), now() from "Post" where id = '${P('a')}';
    insert into "Post"(id, state, "publishDate", "organizationId", "integrationId", content, "group", title, settings, image, "createdAt", "updatedAt")
    select '${FB_B}', 'DRAFT', "publishDate", "organizationId", '${FB}', content, "group", title, '{"__type":"facebook"}', image, now(), now() from "Post" where id = '${P('b')}';
    commit;`);
  return token;
}

function ensureFacebookIntegration() {
  const exists = sql(`select count(*) from "Integration" where id = '${FB}'`);
  if (exists === '1') return;
  // copy the local IG DEMO row (dummy token) under a new id as a Facebook channel
  sql(`
    begin;
    create temp table neptive_fb as select * from "Integration" where id = '${IG}';
    update neptive_fb set id = '${FB}', name = 'Aurora Gallorini Facebook (LOCAL CHECK)', "providerIdentifier" = 'facebook',
           "internalId" = 'local-check-fb', picture = null;
    insert into "Integration" select * from neptive_fb;
    commit;`);
}

async function portalSession(token) {
  const consume = await fetch(`${API}/neptive/portal-auth/magic`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ token }),
  });
  const portal = consume.headers.get('neptive-portal');
  if (!portal) throw new Error(`magic link not consumed: HTTP ${consume.status}`);
  return { 'content-type': 'application/json', origin: ORIGIN, 'neptive-portal': portal };
}

async function agencySession() {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@neptive.com', password: process.env.ADMIN_PASSWORD || 'neptive-local-admin', provider: 'LOCAL' }),
  });
  const auth = login.headers.get('auth');
  if (!auth) throw new Error(`agency login failed: HTTP ${login.status}`);
  return { 'content-type': 'application/json', auth };
}

async function portalItem(headers, itemId = ITEM) {
  const peds = await (await fetch(`${API}/neptive/portal/peds`, { headers })).json();
  return peds.flatMap((ped) => ped.items || []).find((entry) => entry.id === itemId);
}

async function approve(headers, approvalId) {
  const response = await fetch(`${API}/neptive/portal/approvals/${approvalId}/transition`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ status: 'APPROVED' }),
  });
  return response.status;
}

const lastActivity = (group) =>
  sql(`select type, visibility, title, replace(body, E'\\n', ' / ') from neptive_activities
       where "relatedPostGroup" = '${group}' and type in ('POST_SCHEDULED', 'OTHER') order by "createdAt" desc limit 1`);

function terminateLeftovers() {
  const ids = sql(`select id from "Post" where id like '5eed1000-%' or "integrationId" = '${FB}'`).split('\n').filter(Boolean);
  for (const id of ids) {
    if (workflowStatus(id) === 'WORKFLOW_EXECUTION_STATUS_RUNNING') {
      temporal('workflow', 'terminate', '-w', `post_${id}`, '--reason', 'neptive schedule-check cleanup');
    }
  }
}

async function main() {
  ensureFacebookIntegration();
  const agency = await agencySession();

  // ---------------------------------------------------------------- 1. future date
  console.log('\n# 1. client approves variant B (Instagram + Facebook), date in the future');
  let portal = await portalSession(seed());
  let item = await portalItem(portal);
  const variantB = item.variants.find((variant) => variant.label === 'B');
  check((await approve(portal, variantB.approval.id)) < 300, 'approval accepted');
  let s = states();
  check(s[P('b')] === 'QUEUE' && s[FB_B] === 'QUEUE', 'B Instagram + Facebook are QUEUE', JSON.stringify(s));
  check(
    [P('a'), FB_A, P('c'), P('d'), P('e')].every((id) => s[id] === 'DRAFT'),
    'A (IG + FB), C, D and the unattached E stay DRAFT'
  );
  check(
    workflowStatus(P('b')) === 'WORKFLOW_EXECUTION_STATUS_RUNNING' && workflowStatus(FB_B) === 'WORKFLOW_EXECUTION_STATUS_RUNNING',
    'workflows post_<B ig> and post_<B fb> RUNNING on Temporal'
  );
  check([P('a'), FB_A].every((id) => workflowStatus(id) === 'NOT_FOUND'), 'no workflow for variant A');
  check(/^POST_SCHEDULED\|CLIENT_VISIBLE/.test(lastActivity(G('b'))), 'client activity "Programmato"', lastActivity(G('b')));
  item = await portalItem(portal);
  const shownB = item.variants.find((variant) => variant.label === 'B');
  check(
    shownB.state === 'CONFIRMED' && shownB.content.variants.every((channel) => channel.publishingState === 'QUEUE'),
    'portal projection: B CONFIRMED with every channel QUEUE (drives "Verrà pubblicato il …")'
  );

  console.log('\n# 1b. second approval of the same variant');
  const second = await approve(portal, variantB.approval.id);
  check(second >= 400, 'refused', `HTTP ${second}`);
  const counts = [await runningCount(P('b')), await runningCount(FB_B)];
  check(counts.every((count) => count === '1'), 'still exactly one running workflow per post', counts.join(' / '));

  console.log('\n# 1d. real post workflow v1.1.2 + real publish gate, fake provider (neptive/dev/gate-check.sh)');
  const gate = sh('bash', ['neptive/dev/gate-check.sh', P('b')], { stdio: ['ignore', 'pipe', 'ignore'] });
  console.log(gate.trim().split('\n').filter((line) => line.startsWith('{')).map((line) => `      ${line}`).join('\n'));
  check(/PROVIDER CALLED|providerCalled["']?:\s*true/i.test(gate), 'the confirmed variant passes the gate (fake provider reached)');

  console.log('\n# 1c. agency reopens the slot');
  const reopen = await fetch(`${API}/neptive/agency/clients/${AURORA}/peds/${PLAN}/items/${ITEM}/reopen`, {
    method: 'POST',
    headers: agency,
    body: JSON.stringify({ comment: 'schedule-check' }),
  });
  check(reopen.status < 300, 'reopen accepted', `HTTP ${reopen.status}`);
  s = states();
  check(s[P('b')] === 'DRAFT' && s[FB_B] === 'DRAFT', 'B back to DRAFT', JSON.stringify(s));
  check(
    workflowStatus(P('b')) !== 'WORKFLOW_EXECUTION_STATUS_RUNNING' && workflowStatus(FB_B) !== 'WORKFLOW_EXECUTION_STATUS_RUNNING',
    'B workflows no longer running',
    `${workflowStatus(P('b'))} / ${workflowStatus(FB_B)}`
  );

  // ---------------------------------------------------------------- 2. passed date
  console.log('\n# 2. approval after the planned date (10:00 Rome, three days ago)');
  terminateLeftovers();
  const since2 = new Date().toISOString();
  portal = await portalSession(seed());
  sql(`update "Post" set "publishDate" = (date_trunc('day', now() at time zone 'Europe/Rome') - interval '3 days' + interval '10 hours') at time zone 'Europe/Rome' at time zone 'UTC'
       where id in ('${P('b')}', '${FB_B}')`);
  item = await portalItem(portal);
  await approve(portal, item.variants.find((variant) => variant.label === 'B').approval.id);
  const moved = sql(`select id, state, to_char("publishDate" at time zone 'UTC' at time zone 'Europe/Rome', 'YYYY-MM-DD HH24:MI'),
                            "publishDate" > (now() at time zone 'UTC') from "Post" where id in ('${P('b')}', '${FB_B}') order by id`);
  check(
    moved.split('\n').every((line) => /\|QUEUE\|\d{4}-\d\d-\d\d 10:00\|t$/.test(line)),
    'moved to a future 10:00 Rome, then QUEUE',
    moved.replace(/\n/g, ' ; ')
  );
  check(/spostata/.test(lastActivity(G('b'))), 'client activity says the date was moved', lastActivity(G('b')));
  const movedRuns = [await runsSince(P('b'), since2), await runsSince(FB_B, since2)];
  check(movedRuns.every((n) => n === 1), 'move then schedule: exactly one workflow run per post', movedRuns.join(' / '));

  // ---------------------------------------------------------------- 3. Temporal down
  if (!process.env.SKIP_TEMPORAL_DOWN) {
    console.log('\n# 3. Temporal stopped at approval time');
    terminateLeftovers();
    portal = await portalSession(seed());
    item = await portalItem(portal);
    sh('docker', ['stop', 'pzn-temporal']);
    try {
      const status = await approve(portal, item.variants.find((variant) => variant.label === 'B').approval.id);
      check(status < 300, 'approval still accepted', `HTTP ${status}`);
      s = states();
      check(s[P('b')] === 'DRAFT' && s[FB_B] === 'DRAFT', 'B stays DRAFT', JSON.stringify(s));
      const confirmed = sql(`select "confirmedVariantId" is not null from neptive_editorial_plan_items where id = '${ITEM}'`);
      check(confirmed === 't', 'the confirmation is kept');
      check(/^OTHER\|INTERNAL\|Approvato ma non programmato/.test(lastActivity(G('b'))), 'agency activity', lastActivity(G('b')));
    } finally {
      sh('docker', ['start', 'pzn-temporal']);
      for (let i = 0; i < 60; i++) {
        try {
          temporal('operator', 'cluster', 'health');
          break;
        } catch {
          await sleep(2000);
        }
      }
    }
  }

  // ---------------------------------------------------------------- 4. single-content item
  console.log('\n# 4. single-content PED item (no variant rows), post E');
  terminateLeftovers();
  portal = await portalSession(seed());
  sql(`
    begin;
    insert into neptive_editorial_plan_items(id, "planId", "postGroup", title, position, "createdAt", "updatedAt")
    values ('${LEGACY_ITEM}', '${PLAN}', '${G('e')}', 'Schedule-check: contenuto singolo', 9, now(), now());
    insert into neptive_content_approvals(id, "orgId", "customerId", "postGroup", status, title, "submittedAt", "createdAt", "updatedAt")
    values (gen_random_uuid()::text, '${ORG}', '${AURORA}', '${G('e')}', 'PENDING_CLIENT_APPROVAL', 'Schedule-check E', now(), now(), now());
    commit;`);
  const legacy = await portalItem(portal, LEGACY_ITEM);
  check(!!legacy?.variants?.[0]?.approval, 'legacy item visible on the portal with its approval');
  await approve(portal, legacy.variants[0].approval.id);
  check(states()[P('e')] === 'QUEUE' && workflowStatus(P('e')) === 'WORKFLOW_EXECUTION_STATUS_RUNNING', 'E QUEUE + workflow RUNNING');
  const reopenLegacy = await fetch(`${API}/neptive/agency/clients/${AURORA}/peds/${PLAN}/items/${LEGACY_ITEM}/reopen`, {
    method: 'POST',
    headers: agency,
    body: '{}',
  });
  check(reopenLegacy.status < 300 && states()[P('e')] === 'DRAFT', 'reopen -> E DRAFT', `HTTP ${reopenLegacy.status}`);
  check(workflowStatus(P('e')) !== 'WORKFLOW_EXECUTION_STATUS_RUNNING', 'E workflow no longer running', workflowStatus(P('e')));

  // ---------------------------------------------------------------- 5. same group, two posts, both alive
  console.log('\n# 5. B (IG + FB, ids sharing segments) approved, then another post sharing segments is scheduled');
  terminateLeftovers();
  portal = await portalSession(seed());
  item = await portalItem(portal);
  await approve(portal, item.variants.find((variant) => variant.label === 'B').approval.id);
  // let the visibility index catch up: from now on postId="<other id>" would list B's runs
  await sleep(6000);
  const alive = () =>
    [P('b'), FB_B].every((id) => workflowStatus(id) === 'WORKFLOW_EXECUTION_STATUS_RUNNING');
  check(alive(), 'end of approval + 6 s: both B workflows RUNNING', `${workflowStatus(P('b'))} / ${workflowStatus(FB_B)}`);
  sql(`
    begin;
    insert into neptive_editorial_plan_items(id, "planId", "postGroup", title, position, "createdAt", "updatedAt")
    values ('${LEGACY_ITEM}', '${PLAN}', '${G('e')}', 'Schedule-check: contenuto singolo', 9, now(), now());
    insert into neptive_content_approvals(id, "orgId", "customerId", "postGroup", status, title, "submittedAt", "createdAt", "updatedAt")
    values (gen_random_uuid()::text, '${ORG}', '${AURORA}', '${G('e')}', 'PENDING_CLIENT_APPROVAL', 'Schedule-check E', now(), now(), now());
    commit;`);
  const listed = temporal('workflow', 'list', '-q', `postId="${P('e')}" AND ExecutionStatus="Running"`);
  check(listed.includes(`post_${P('b')}`), 'precondition: the fuzzy query for E lists B (the upstream pattern)');
  const single = await portalItem(portal, LEGACY_ITEM);
  await approve(portal, single.variants[0].approval.id);
  check(workflowStatus(P('e')) === 'WORKFLOW_EXECUTION_STATUS_RUNNING', 'E scheduled, workflow RUNNING');
  check(alive(), 'scheduling E did not terminate B Instagram / Facebook', `${workflowStatus(P('b'))} / ${workflowStatus(FB_B)}`);

  // ---------------------------------------------------------------- 6. agency deletes the scheduled group
  console.log('\n# 6. the agency deletes the approved group (Instagram + Facebook) from Postiz');
  terminateLeftovers();
  portal = await portalSession(seed());
  item = await portalItem(portal);
  await approve(portal, item.variants.find((variant) => variant.label === 'B').approval.id);
  check([P('b'), FB_B].every((id) => workflowStatus(id) === RUNNING), 'precondition: both B workflows RUNNING');
  const deleted = await agencyCall(agency, 'DELETE', `/posts/${G('b')}`);
  check(deleted < 300, 'DELETE /posts/<group> accepted', `HTTP ${deleted}`);
  check(
    sql(`select count(*) from "Post" where "group" = '${G('b')}' and "deletedAt" is null`) === '0',
    'every post of the group is marked deleted'
  );
  check(
    [P('b'), FB_B].every((id) => workflowStatus(id) !== RUNNING),
    'the workflows of BOTH channels are stopped',
    `${workflowStatus(P('b'))} / ${workflowStatus(FB_B)}`
  );

  // ---------------------------------------------------------------- 7. agency moves the date of a queued post
  console.log('\n# 7. the agency changes the date of an approved (QUEUE) post, action "update"');
  terminateLeftovers();
  portal = await portalSession(seed());
  item = await portalItem(portal);
  await approve(portal, item.variants.find((variant) => variant.label === 'B').approval.id);
  const before = runId(P('b'));
  const newDate = new Date(Date.now() + 5 * 24 * 3600 * 1000);
  newDate.setUTCSeconds(0, 0);
  const since7 = new Date().toISOString();
  const moved7 = await agencyCall(agency, 'PUT', `/posts/${P('b')}/date`, {
    date: newDate.toISOString().slice(0, 19),
    action: 'update',
  });
  check(moved7 < 300, 'PUT /posts/<id>/date accepted', `HTTP ${moved7}`);
  check(sql(`select state from "Post" where id = '${P('b')}'`) === 'QUEUE', 'still QUEUE');
  const after = runId(P('b'));
  check(!!after && after !== before && workflowStatus(P('b')) === RUNNING, 'workflow restarted (new run, RUNNING)', `${before} -> ${after}`);
  check((await runsSince(P('b'), since7)) === 1, 'exactly one new run, started after the new date was written');
  check(workflowStatus(FB_B) === RUNNING, 'the Facebook twin is untouched');

  // ---------------------------------------------------------------- 8. approval and reopen at the same time
  console.log('\n# 8. reopen and a new approval of the same slot fired at the same time (x4)');
  for (let round = 0; round < 4; round++) {
    terminateLeftovers();
    portal = await portalSession(seed());
    item = await portalItem(portal);
    const approvalB = item.variants.find((variant) => variant.label === 'B').approval.id;
    await approve(portal, approvalB);
    const reopenCall = () =>
      agencyCall(agency, 'POST', `/neptive/agency/clients/${AURORA}/peds/${PLAN}/items/${ITEM}/reopen`, {});
    const statuses =
      round % 2 === 0
        ? await Promise.all([reopenCall(), sleep(15).then(() => approve(portal, approvalB))])
        : await Promise.all([approve(portal, approvalB), sleep(15).then(reopenCall)]);
    const confirmed = sql(`select "confirmedVariantId" is not null from neptive_editorial_plan_items where id = '${ITEM}'`) === 't';
    const s8 = states();
    const runningB = [P('b'), FB_B].map((id) => workflowStatus(id) === RUNNING);
    const ok = confirmed
      ? s8[P('b')] === 'QUEUE' && s8[FB_B] === 'QUEUE' && runningB.every(Boolean)
      : s8[P('b')] === 'DRAFT' && s8[FB_B] === 'DRAFT' && !runningB.some(Boolean);
    check(
      ok,
      `round ${round + 1}: slot ${confirmed ? 'confirmed' : 'open'} and B posts consistent`,
      `HTTP reopen/approve ${round % 2 === 0 ? statuses.join('/') : statuses.slice().reverse().join('/')}, ${s8[P('b')]}/${s8[FB_B]}, running ${runningB.join('/')}`
    );
  }

  // ---------------------------------------------------------------- cleanup
  terminateLeftovers();
  seed();
  sql(`begin;
       delete from neptive_editorial_plan_items where id = '${LEGACY_ITEM}';
       delete from "Post" where "integrationId" = '${FB}';
       delete from "Integration" where id = '${FB}';
       commit;`);
  terminateLeftovers();
  console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'} (demo re-seeded, local FB channel removed, workflows terminated)`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
