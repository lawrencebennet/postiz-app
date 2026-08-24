import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(root, 'package.json'));
const { PrismaClient } = require('@prisma/client');

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:4200';
const results = [];
const evidence = {};

const prisma = new PrismaClient();

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function is2xx(status) {
  return status >= 200 && status < 300;
}

function must(name, ok, detail) {
  record(name, ok, detail);
  if (!ok) {
    throw new Error(`required check failed: ${name}${detail ? ` (${detail})` : ''}`);
  }
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function extractToken(url) {
  const match = String(url).match(/\/portal\/magic\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function req(path, { method = 'GET', headers = {}, body, raw } = {}) {
  const response = await fetch(`${BACKEND}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (raw) {
    return { response, json, text };
  }
  return { status: response.status, json, headers: response.headers, text };
}

function agencyHeaders(auth) {
  return { auth };
}

function portalHeaders(token) {
  return { 'neptive-portal': token };
}

function futureDate(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function pastDate(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function waitForBackend() {
  for (let i = 0; i < 90; i++) {
    try {
      const { status } = await req('/auth/can-register');
      if (is2xx(status)) {
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('backend did not become ready');
}

function temporalIp() {
  return execFileSync(
    'docker',
    ['inspect', '-f', '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}', 'temporal'],
    { encoding: 'utf8' }
  )
    .trim()
    .split(/\s+/)[0];
}

function temporalCli(args) {
  const ip = temporalIp();
  return execFileSync(
    'docker',
    ['exec', '-e', `TEMPORAL_ADDRESS=${ip}:7233`, 'temporal', 'temporal', ...args],
    { encoding: 'utf8', timeout: 15000 }
  );
}

async function seedChannel(orgId, customerId, name, internalId, state, publishDate, group) {
  const integration = await prisma.integration.create({
    data: {
      internalId,
      organizationId: orgId,
      name,
      providerIdentifier: 'x',
      type: 'social',
      token: 'dev-fixture-not-a-real-token',
      customerId,
      disabled: false,
    },
  });
  const post = await prisma.post.create({
    data: {
      state,
      publishDate,
      organizationId: orgId,
      integrationId: integration.id,
      content: JSON.stringify([{ content: `${name} fixture post`, image: [] }]),
      group,
      title: name,
    },
  });
  return { integration, post };
}

async function main() {
  await waitForBackend();
  record('backend reachable', true, BACKEND);

  const password = 'NeptiveVal1d!';
  const email = 'agency@neptive.local';
  let auth;
  const register = await req('/auth/register', {
    method: 'POST',
    body: {
      email,
      password,
      provider: 'LOCAL',
      company: 'Neptive Agency',
    },
  });
  if (is2xx(register.status)) {
    auth = register.headers.get('auth');
    record('agency register', Boolean(auth), `status ${register.status}`);
  } else {
    const login = await req('/auth/login', {
      method: 'POST',
      body: { email, password, provider: 'LOCAL' },
    });
    auth = login.headers.get('auth');
    record(
      'agency login fallback',
      is2xx(login.status) && Boolean(auth),
      `register ${register.status} login ${login.status} body=${JSON.stringify(register.json).slice(0, 180)}`
    );
  }
  must('agency auth cookie/header', Boolean(auth), 'auth header present');

  const self = await req('/user/self', { headers: agencyHeaders(auth) });
  must('agency /user/self', is2xx(self.status) && self.json?.orgId, `status ${self.status}`);
  const orgId = self.json.orgId;
  evidence.orgId = orgId;
  evidence.agencyUserId = self.json.id;

  function pickNamedClient(list, name) {
    const matches = (list || []).filter((c) => c.name === name);
    if (!matches.length) {
      return undefined;
    }
    return [...matches].sort(
      (a, b) => (b.channelCount || 0) - (a.channelCount || 0)
    )[0];
  }

  let clientA;
  let clientB;
  const existingClients = await req('/neptive/agency/clients', {
    headers: agencyHeaders(auth),
  });
  if (is2xx(existingClients.status) && Array.isArray(existingClients.json)) {
    clientA = pickNamedClient(existingClients.json, 'Client A');
    clientB = pickNamedClient(existingClients.json, 'Client B');
  }
  if (!clientA?.id) {
    const createA = await req('/neptive/agency/clients', {
      method: 'POST',
      headers: agencyHeaders(auth),
      body: { name: 'Client A', website: 'https://client-a.example', notes: 'vertical slice A' },
    });
    clientA = createA.json;
  }
  if (!clientB?.id) {
    const createB = await req('/neptive/agency/clients', {
      method: 'POST',
      headers: agencyHeaders(auth),
      body: { name: 'Client B', website: 'https://client-b.example', notes: 'vertical slice B' },
    });
    clientB = createB.json;
  }
  must('create/list Client A', Boolean(clientA?.id), clientA?.id);
  must('create/list Client B', Boolean(clientB?.id), clientB?.id);
  evidence.clientA = clientA.id;
  evidence.clientB = clientB.id;

  const mappedA = await req(`/neptive/agency/clients/${clientA.id}`, {
    headers: agencyHeaders(auth),
  });
  const mappedB = await req(`/neptive/agency/clients/${clientB.id}`, {
    headers: agencyHeaders(auth),
  });
  record(
    'Organization → Customer → profile mapping',
    is2xx(mappedA.status) && is2xx(mappedB.status) && mappedA.json.id === clientA.id,
    `A ${mappedA.status} B ${mappedB.status}`
  );

  const groupA1 = randomUUID();
  const groupA2 = randomUUID();
  const groupA3 = randomUUID();
  const groupB1 = randomUUID();
  const groupB2 = randomUUID();
  const publishedA = randomUUID();
  const publishedB = randomUUID();

  const oldIntegrations = await prisma.integration.findMany({
    where: { organizationId: orgId, internalId: { startsWith: 'neptive-fixture-' } },
    select: { id: true },
  });
  if (oldIntegrations.length) {
    const oldIds = oldIntegrations.map((row) => row.id);
    await prisma.post.deleteMany({
      where: { organizationId: orgId, integrationId: { in: oldIds } },
    });
    await prisma.integration.deleteMany({
      where: { id: { in: oldIds } },
    });
  }

  const seedA1 = await seedChannel(
    orgId,
    clientA.id,
    'Client A draft approve',
    'neptive-fixture-a1',
    'DRAFT',
    futureDate(21),
    groupA1
  );
  const seedA2 = await seedChannel(
    orgId,
    clientA.id,
    'Client A draft changes',
    'neptive-fixture-a2',
    'DRAFT',
    futureDate(22),
    groupA2
  );
  const seedA3 = await seedChannel(
    orgId,
    clientA.id,
    'Client A draft reject',
    'neptive-fixture-a3',
    'DRAFT',
    futureDate(23),
    groupA3
  );
  const seedB1 = await seedChannel(
    orgId,
    clientB.id,
    'Client B queued bait',
    'neptive-fixture-b1',
    'QUEUE',
    futureDate(24),
    groupB1
  );
  const seedB2 = await seedChannel(
    orgId,
    clientB.id,
    'Client B draft',
    'neptive-fixture-b2',
    'DRAFT',
    futureDate(25),
    groupB2
  );
  await seedChannel(
    orgId,
    clientA.id,
    'Client A published',
    'neptive-fixture-a-pub',
    'PUBLISHED',
    pastDate(2),
    publishedA
  );
  await seedChannel(
    orgId,
    clientB.id,
    'Client B published',
    'neptive-fixture-b-pub',
    'PUBLISHED',
    pastDate(2),
    publishedB
  );
  evidence.posts = {
    aApprove: seedA1.post.id,
    aChanges: seedA2.post.id,
    aReject: seedA3.post.id,
    bQueue: seedB1.post.id,
    groups: { groupA1, groupA2, groupA3, groupB1, groupB2 },
  };
  record('seed Postiz integrations and posts', true, `A groups ${groupA1.slice(0, 8)} B bait QUEUE ${seedB1.post.id}`);

  const inviteA = await req(`/neptive/agency/clients/${clientA.id}/users`, {
    method: 'POST',
    headers: agencyHeaders(auth),
    body: { email: 'client-a@neptive.local', name: 'Client A User' },
  });
  const inviteB = await req(`/neptive/agency/clients/${clientB.id}/users`, {
    method: 'POST',
    headers: agencyHeaders(auth),
    body: { email: 'client-b@neptive.local', name: 'Client B User' },
  });
  must('invite Client A portal user', is2xx(inviteA.status) && inviteA.json?.url, `status ${inviteA.status}`);
  must('invite Client B portal user', is2xx(inviteB.status) && inviteB.json?.url, `status ${inviteB.status}`);
  const tokenA = extractToken(inviteA.json.url);
  const tokenB = extractToken(inviteB.json.url);
  must('magic URL contains raw token', Boolean(tokenA) && Boolean(tokenB));

  const storedA = await prisma.neptiveMagicLink.findFirst({
    where: { clientUserId: inviteA.json.id },
    orderBy: { createdAt: 'desc' },
  });
  record(
    'raw magic token is not stored',
    Boolean(storedA) &&
      storedA.tokenHash === hashToken(tokenA) &&
      storedA.tokenHash !== tokenA &&
      !JSON.stringify(storedA).includes(tokenA),
    storedA ? `hash ${storedA.tokenHash.slice(0, 12)}…` : 'missing row'
  );

  const peekA = await req(`/neptive/portal-auth/magic/${tokenA}`);
  const stillUnconsumed = await prisma.neptiveMagicLink.findUnique({
    where: { tokenHash: hashToken(tokenA) },
  });
  record(
    'GET magic peek does not consume',
    is2xx(peekA.status) &&
      peekA.json?.valid === true &&
      peekA.json?.email === 'client-a@neptive.local' &&
      !stillUnconsumed?.consumedAt,
    JSON.stringify(peekA.json)
  );

  const consumeA = await req('/neptive/portal-auth/magic', {
    method: 'POST',
    raw: true,
    body: { token: tokenA },
  });
  const portalA = consumeA.response.headers.get('neptive-portal');
  must(
    'POST consume authenticates Client A',
    is2xx(consumeA.response.status) && Boolean(portalA),
    `status ${consumeA.response.status}`
  );
  evidence.portalA = 'present';

  const meA = await req('/neptive/portal/me', { headers: portalHeaders(portalA) });
  record(
    'portal session bound to Client A only',
    is2xx(meA.status) && meA.json?.customerId === clientA.id && meA.json?.email === 'client-a@neptive.local',
    JSON.stringify(meA.json)
  );

  const replayA = await req('/neptive/portal-auth/magic', {
    method: 'POST',
    body: { token: tokenA },
  });
  record('consumed magic token cannot be reused', replayA.status >= 400, `status ${replayA.status}`);

  const invalid = await req('/neptive/portal-auth/magic', {
    method: 'POST',
    body: { token: 'this-token-is-invalid-and-long-enough' },
  });
  record('invalid magic token fails', invalid.status >= 400, `status ${invalid.status}`);

  const expiredToken = `${tokenB}-expired-test`;
  const expiredHash = hashToken(expiredToken);
  const expiredUser = await prisma.neptiveClientUser.findFirst({
    where: { email: 'client-b@neptive.local' },
  });
  await prisma.neptiveMagicLink.create({
    data: {
      tokenHash: expiredHash,
      clientUserId: expiredUser.id,
      customerId: clientB.id,
      orgId,
      expiresAt: new Date(Date.now() - 60_000),
    },
  });
  const expiredPeek = await req(`/neptive/portal-auth/magic/${expiredToken}`);
  const expiredConsume = await req('/neptive/portal-auth/magic', {
    method: 'POST',
    body: { token: expiredToken },
  });
  record(
    'expired magic token fails',
    expiredPeek.json?.valid === false && expiredConsume.status >= 400,
    `peek ${JSON.stringify(expiredPeek.json)} consume ${expiredConsume.status}`
  );

  const consumeB = await req('/neptive/portal-auth/magic', {
    method: 'POST',
    raw: true,
    body: { token: tokenB },
  });
  const portalB = consumeB.response.headers.get('neptive-portal');
  must('POST consume authenticates Client B', is2xx(consumeB.response.status) && Boolean(portalB));
  const meB = await req('/neptive/portal/me', { headers: portalHeaders(portalB) });
  record(
    'Client B session is not Client A',
    meB.json?.customerId === clientB.id && meB.json?.customerId !== clientA.id,
    JSON.stringify(meB.json)
  );

  const stolen = await req('/neptive/portal-auth/magic', {
    method: 'POST',
    body: { token: tokenA },
  });
  record(
    'Client B cannot replay Client A token',
    stolen.status >= 400,
    `status ${stolen.status}`
  );

  const settings = await req('/user/self', { headers: portalHeaders(portalA) });
  record(
    'portal cookie is not Postiz org auth',
    settings.status === 401,
    `status ${settings.status}`
  );
  const agencyWithPortal = await req('/neptive/agency/clients', {
    headers: portalHeaders(portalA),
  });
  record(
    'portal session cannot list agency clients',
    agencyWithPortal.status === 401,
    `status ${agencyWithPortal.status}`
  );
  const integrations = await req('/integrations/list', {
    headers: portalHeaders(portalA),
  });
  record(
    'portal cannot hit Postiz connected integrations',
    integrations.status === 401,
    `status ${integrations.status}`
  );
  const postsOrg = await req('/posts', { headers: portalHeaders(portalA) });
  record(
    'portal cannot hit Postiz posts API',
    postsOrg.status === 401,
    `status ${postsOrg.status}`
  );
  const catalog = await req('/integrations', { headers: portalHeaders(portalA) });
  record(
    'GET /integrations catalog is upstream-public (provider list, not org channels)',
    is2xx(catalog.status) &&
      !JSON.stringify(catalog.json).includes(seedA1.integration.id) &&
      !JSON.stringify(catalog.json).includes(clientA.id),
    `status ${catalog.status} (Postiz NoAuthIntegrationsController)`
  );

  const pedB = await req(`/neptive/agency/clients/${clientB.id}/peds`, {
    method: 'POST',
    headers: agencyHeaders(auth),
    body: {
      name: 'Client B PED',
      periodStart: futureDate(-10).toISOString(),
      periodEnd: futureDate(20).toISOString(),
      objectives: 'secret B',
    },
  });
  const strategyB = await req(`/neptive/agency/clients/${clientB.id}/strategy`, {
    method: 'POST',
    headers: agencyHeaders(auth),
    body: { kind: 'OBJECTIVE', title: 'Client B secret objective', visibility: 'CLIENT_VISIBLE' },
  });
  const activityB = await req(`/neptive/agency/clients/${clientB.id}/activities`, {
    method: 'POST',
    headers: agencyHeaders(auth),
    body: { type: 'MEETING', title: 'Client B secret meeting', visibility: 'CLIENT_VISIBLE' },
  });
  const materialB = await req(`/neptive/agency/clients/${clientB.id}/materials`, {
    method: 'POST',
    headers: agencyHeaders(auth),
    body: { title: 'Client B secret file', visibility: 'CLIENT_VISIBLE' },
  });
  const reportB = await req(`/neptive/agency/clients/${clientB.id}/reports`, {
    method: 'POST',
    headers: agencyHeaders(auth),
    body: {
      periodStart: pastDate(30).toISOString(),
      periodEnd: new Date().toISOString(),
      title: 'Client B secret report',
    },
  });
  const approvalB = await req(`/neptive/agency/clients/${clientB.id}/approvals`, {
    method: 'POST',
    headers: agencyHeaders(auth),
    body: { postGroup: groupB2, title: 'Client B approval' },
  });
  await req(
    `/neptive/agency/clients/${clientB.id}/approvals/${approvalB.json.id}/transition`,
    {
      method: 'POST',
      headers: agencyHeaders(auth),
      body: { status: 'PENDING_INTERNAL_REVIEW' },
    }
  );
  await req(
    `/neptive/agency/clients/${clientB.id}/approvals/${approvalB.json.id}/transition`,
    {
      method: 'POST',
      headers: agencyHeaders(auth),
      body: { status: 'PENDING_CLIENT_APPROVAL' },
    }
  );

  const ids = {
    ped: pedB.json?.id,
    strategy: strategyB.json?.id,
    activity: activityB.json?.id,
    material: materialB.json?.id,
    report: reportB.json?.id,
    approval: approvalB.json?.id,
  };
  evidence.clientBResources = ids;

  const isolationChecks = [
    ['GET ped by Client B id', `/neptive/portal/peds/${ids.ped}`, 'GET'],
    ['GET approval by Client B id', `/neptive/portal/approvals/${ids.approval}`, 'GET'],
    ['GET report by Client B id', `/neptive/portal/reports/${ids.report}`, 'GET'],
  ];
  for (const [name, path, method] of isolationChecks) {
    const hit = await req(path, { method, headers: portalHeaders(portalA) });
    record(
      name,
      hit.status === 403 || hit.status === 404,
      `status ${hit.status} body=${JSON.stringify(hit.json).slice(0, 160)}`
    );
  }

  const approveBAsA = await req(`/neptive/portal/approvals/${ids.approval}/transition`, {
    method: 'POST',
    headers: portalHeaders(portalA),
    body: { status: 'APPROVED', customerId: clientB.id },
  });
  record(
    'Client A cannot approve Client B post group',
    approveBAsA.status === 403 || approveBAsA.status === 404,
    `status ${approveBAsA.status}`
  );

  const mutateB = await req(`/neptive/agency/clients/${clientB.id}`, {
    method: 'PUT',
    headers: portalHeaders(portalA),
    body: { name: 'Hacked B', customerId: clientB.id },
  });
  record(
    'Client A portal cannot mutate Client B via agency route',
    mutateB.status === 401,
    `status ${mutateB.status}`
  );

  const lists = [
    ['peds', '/neptive/portal/peds', 'Client B PED'],
    ['strategy', '/neptive/portal/strategy', 'Client B secret objective'],
    ['activities', '/neptive/portal/activities', 'Client B secret meeting'],
    ['materials', '/neptive/portal/materials', 'Client B secret file'],
    ['reports', '/neptive/portal/reports', 'Client B secret report'],
    ['approvals', '/neptive/portal/approvals', 'Client B approval'],
  ];
  for (const [name, path, secret] of lists) {
    const listed = await req(`${path}?customerId=${clientB.id}`, {
      headers: portalHeaders(portalA),
    });
    const blob = JSON.stringify(listed.json || []);
    record(
      `Client A ${name} list ignores customerId query and hides Client B`,
      is2xx(listed.status) && !blob.includes(secret) && !blob.includes(clientB.id),
      `status ${listed.status} bytes=${blob.length}`
    );
  }

  const analyticsA = await req(`/neptive/portal/analytics?customerId=${clientB.id}`, {
    headers: portalHeaders(portalA),
  });
  const analyticsBlob = JSON.stringify(analyticsA.json || []);
  record(
    'Client A analytics does not include Client B channels',
    is2xx(analyticsA.status) && !analyticsBlob.includes(seedB1.integration.id),
    `status ${analyticsA.status}`
  );

  const contentA = await req('/neptive/portal/content?state=all', {
    headers: portalHeaders(portalA),
  });
  const contentB = await req('/neptive/portal/content?state=all', {
    headers: portalHeaders(portalB),
  });
  const postsA = contentA.json?.posts || [];
  const postsB = contentB.json?.posts || [];
  const idsA = postsA.map((p) => p.group);
  const idsB = postsB.map((p) => p.group);
  record(
    'Client A sees Client A posts only',
    is2xx(contentA.status) &&
      idsA.includes(groupA1) &&
      !idsA.includes(groupB1) &&
      !idsA.includes(groupB2),
    `groups=${idsA.join(',')}`
  );
  record(
    'Client B sees Client B posts only',
    is2xx(contentB.status) &&
      idsB.includes(groupB1) &&
      !idsB.includes(groupA1) &&
      !idsB.includes(groupA2),
    `groups=${idsB.join(',')}`
  );

  const scheduledA = await req('/neptive/portal/content?state=scheduled', {
    headers: portalHeaders(portalA),
  });
  const scheduledIds = (scheduledA.json?.posts || []).map((p) => p.id);
  record(
    'Client A scheduled list excludes Client B QUEUE bait',
    is2xx(scheduledA.status) && !scheduledIds.includes(seedB1.post.id),
    `ids=${scheduledIds.join(',')}`
  );

  const createApprovalA = await req(`/neptive/agency/clients/${clientA.id}/approvals`, {
    method: 'POST',
    headers: agencyHeaders(auth),
    body: { postGroup: groupA1, title: 'Client A approve path', customerId: clientB.id },
  });
  must(
    'agency creates Client A approval ignoring body.customerId',
    is2xx(createApprovalA.status) && createApprovalA.json?.customerId === clientA.id,
    `status ${createApprovalA.status} customer=${createApprovalA.json?.customerId}`
  );
  const approvalId = createApprovalA.json.id;

  const t1 = await req(
    `/neptive/agency/clients/${clientA.id}/approvals/${approvalId}/transition`,
    {
      method: 'POST',
      headers: agencyHeaders(auth),
      body: { status: 'PENDING_INTERNAL_REVIEW' },
    }
  );
  const t2 = await req(
    `/neptive/agency/clients/${clientA.id}/approvals/${approvalId}/transition`,
    {
      method: 'POST',
      headers: agencyHeaders(auth),
      body: { status: 'PENDING_CLIENT_APPROVAL' },
    }
  );
  record(
    'agency two-stage review DRAFT → INTERNAL → CLIENT',
    is2xx(t1.status) &&
      t1.json?.status === 'PENDING_INTERNAL_REVIEW' &&
      is2xx(t2.status) &&
      t2.json?.status === 'PENDING_CLIENT_APPROVAL',
    `t1 ${t1.json?.status} t2 ${t2.json?.status}`
  );

  const invalidJump = await req(
    `/neptive/agency/clients/${clientA.id}/approvals/${approvalId}/transition`,
    {
      method: 'POST',
      headers: agencyHeaders(auth),
      body: { status: 'DRAFT' },
    }
  );
  record(
    'invalid approval transition fails',
    invalidJump.status >= 400,
    `status ${invalidJump.status}`
  );

  const portalApproveWrong = await req(
    `/neptive/portal/approvals/${approvalId}/transition`,
    {
      method: 'POST',
      headers: portalHeaders(portalB),
      body: { status: 'APPROVED' },
    }
  );
  record(
    'Client B cannot approve Client A content',
    portalApproveWrong.status === 403 || portalApproveWrong.status === 404,
    `status ${portalApproveWrong.status}`
  );

  const beforeApprove = await prisma.post.findUnique({ where: { id: seedA1.post.id } });
  const portalApprove = await req(`/neptive/portal/approvals/${approvalId}/transition`, {
    method: 'POST',
    headers: portalHeaders(portalA),
    body: { status: 'APPROVED', customerId: clientB.id },
  });
  record(
    'Client A approves own content',
    is2xx(portalApprove.status) && portalApprove.json?.status === 'APPROVED',
    `status ${portalApprove.status} approval=${portalApprove.json?.status}`
  );

  const persisted = await prisma.neptiveContentApproval.findUnique({
    where: { id: approvalId },
    include: { actions: true, comments: true },
  });
  record(
    'approval persistence and audit',
    persisted?.status === 'APPROVED' &&
      persisted.actions.some((a) => a.action === 'APPROVED_CLIENT' && a.actorType === 'CLIENT_USER'),
    `status ${persisted?.status} actions=${persisted?.actions.map((a) => a.action).join(',')}`
  );

  await new Promise((r) => setTimeout(r, 1500));
  const queued = await prisma.post.findUnique({ where: { id: seedA1.post.id } });
  record(
    'APPROVED invokes Postiz schedule (DRAFT → QUEUE)',
    beforeApprove.state === 'DRAFT' && queued.state === 'QUEUE',
    `before=${beforeApprove.state} after=${queued.state}`
  );
  record(
    'Postiz publishing state is QUEUE not a Neptive publish enum',
    queued.state === 'QUEUE' && persisted.status === 'APPROVED',
    `post=${queued.state} approval=${persisted.status}`
  );

  let temporalDetail = 'not queried';
  let temporalOk = false;
  try {
    const described = temporalCli([
      'workflow',
      'describe',
      '-n',
      'default',
      '--workflow-id',
      `post_${seedA1.post.id}`,
    ]);
    temporalOk =
      /Running|WORKFLOW_EXECUTION_STATUS_RUNNING|postWorkflowV109/i.test(described) &&
      !/not found/i.test(described);
    temporalDetail = described.split('\n').slice(0, 12).join(' | ');
  } catch (error) {
    temporalDetail = String(error.stdout || error.message || error).slice(0, 400);
  }
  record('Temporal accepted post workflow without real publication', temporalOk, temporalDetail);

  const createChanges = await req(`/neptive/agency/clients/${clientA.id}/approvals`, {
    method: 'POST',
    headers: agencyHeaders(auth),
    body: { postGroup: groupA2, title: 'Client A changes path' },
  });
  await req(
    `/neptive/agency/clients/${clientA.id}/approvals/${createChanges.json.id}/transition`,
    {
      method: 'POST',
      headers: agencyHeaders(auth),
      body: { status: 'PENDING_INTERNAL_REVIEW' },
    }
  );
  await req(
    `/neptive/agency/clients/${clientA.id}/approvals/${createChanges.json.id}/transition`,
    {
      method: 'POST',
      headers: agencyHeaders(auth),
      body: { status: 'PENDING_CLIENT_APPROVAL' },
    }
  );
  await prisma.post.update({
    where: { id: seedA2.post.id },
    data: { state: 'QUEUE' },
  });
  const changes = await req(
    `/neptive/portal/approvals/${createChanges.json.id}/transition`,
    {
      method: 'POST',
      headers: portalHeaders(portalA),
      body: { status: 'CHANGES_REQUESTED', comment: 'please revise headline' },
    }
  );
  const afterChanges = await prisma.post.findUnique({ where: { id: seedA2.post.id } });
  record(
    'CHANGES_REQUESTED unschedules QUEUE back to DRAFT',
    is2xx(changes.status) &&
      changes.json?.status === 'CHANGES_REQUESTED' &&
      afterChanges.state === 'DRAFT',
    `approval=${changes.json?.status} post=${afterChanges.state}`
  );

  const terminalChange = await req(
    `/neptive/agency/clients/${clientA.id}/approvals/${approvalId}/transition`,
    {
      method: 'POST',
      headers: agencyHeaders(auth),
      body: { status: 'CHANGES_REQUESTED', comment: 'too late' },
    }
  );
  record(
    'CHANGES_REQUESTED from APPROVED is rejected by state machine',
    terminalChange.status >= 400,
    `status ${terminalChange.status}`
  );

  const createReject = await req(`/neptive/agency/clients/${clientA.id}/approvals`, {
    method: 'POST',
    headers: agencyHeaders(auth),
    body: { postGroup: groupA3, title: 'Client A reject path' },
  });
  await req(
    `/neptive/agency/clients/${clientA.id}/approvals/${createReject.json.id}/transition`,
    {
      method: 'POST',
      headers: agencyHeaders(auth),
      body: { status: 'PENDING_INTERNAL_REVIEW' },
    }
  );
  await req(
    `/neptive/agency/clients/${clientA.id}/approvals/${createReject.json.id}/transition`,
    {
      method: 'POST',
      headers: agencyHeaders(auth),
      body: { status: 'PENDING_CLIENT_APPROVAL' },
    }
  );
  const clientReject = await req(
    `/neptive/portal/approvals/${createReject.json.id}/transition`,
    {
      method: 'POST',
      headers: portalHeaders(portalA),
      body: { status: 'REJECTED', comment: 'do not publish this' },
    }
  );
  const rejectedPost = await prisma.post.findUnique({ where: { id: seedA3.post.id } });
  record(
    'REJECTED stays DRAFT and is not queued',
    is2xx(clientReject.status) &&
      clientReject.json?.status === 'REJECTED' &&
      rejectedPost.state === 'DRAFT',
    `approval=${clientReject.json?.status} post=${rejectedPost.state}`
  );

  const createQueueThenChange = await req(`/neptive/agency/clients/${clientA.id}/approvals`, {
    method: 'POST',
    headers: agencyHeaders(auth),
    body: { postGroup: groupA2, title: 'already exists' },
  });
  record(
    'duplicate approval for same group returns existing row',
    is2xx(createQueueThenChange.status) &&
      createQueueThenChange.json?.id === createChanges.json.id,
    `id ${createQueueThenChange.json?.id}`
  );

  const publishedStay = await prisma.post.findFirst({
    where: { group: publishedA },
  });
  record(
    'already published fixture was not unpublished',
    publishedStay?.state === 'PUBLISHED',
    `state ${publishedStay?.state}`
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    backend: BACKEND,
    frontend: FRONTEND,
    evidence,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
  writeFileSync(resolve(root, 'neptive/.validation-last.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
  if (summary.failed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
