// LOCAL ONLY. Proves on real Postgres (local pzn-postgres, READ COMMITTED as in production) that the client's
// conditional credential write cannot overwrite an agency reset/removal that commits while it waits.
// Uses the exact Prisma calls of NeptiveCredentialRepository.replaceOwnCredential / setAgencyCredential on a
// throwaway client user (deleted at the end). usage: node --env-file=.env neptive/dev/credential-race-check.mjs
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.cwd(), 'package.json'));
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ' :: ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const customer = await prisma.customer.findFirst({ where: { deletedAt: null }, select: { id: true, orgId: true } });
const user = await prisma.neptiveClientUser.create({
  data: { orgId: customer.orgId, customerId: customer.id, email: `race-${Date.now()}@neptive.local`, name: 'race check' },
});
const base = { clientUserId: user.id, orgId: customer.orgId, customerId: customer.id };

async function clientChange(expectedHash) {
  return prisma.$transaction(async (tx) => {
    const data = { passwordHash: 'CLIENT-NEW', source: 'CLIENT', mustChange: false, setByUserId: null };
    const written = expectedHash
      ? await tx.neptiveClientCredential.updateMany({ where: { clientUserId: user.id, passwordHash: expectedHash }, data })
      : await tx.neptiveClientCredential.createMany({ data: [{ ...base, ...data }], skipDuplicates: true });
    if (!written.count) return null;
    await tx.neptivePortalSession.updateMany({ where: { clientUserId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return tx.neptivePortalSession.create({ data: { ...base, tokenHash: `race-${Date.now()}-${Math.random()}`, expiresAt: new Date(Date.now() + 60000) } });
  });
}

// agency transaction that holds the row (or the unique key) while the client's write is issued
async function agencyHolding(kind, release) {
  return prisma.$transaction(
    async (tx) => {
      if (kind === 'reset') {
        const w = await tx.neptiveClientCredential.updateMany({ where: { clientUserId: user.id }, data: { passwordHash: 'AGENCY-TEMP', source: 'AGENCY', mustChange: true } });
        if (!w.count) await tx.neptiveClientCredential.createMany({ data: [{ ...base, passwordHash: 'AGENCY-TEMP', source: 'AGENCY', mustChange: true }], skipDuplicates: true });
      } else {
        await tx.neptiveClientCredential.deleteMany({ where: { clientUserId: user.id } });
      }
      await tx.neptivePortalSession.updateMany({ where: { clientUserId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await release;
    },
    { timeout: 20000 }
  );
}

async function scenario(label, setup, kind, expectedHash, expect) {
  await prisma.neptiveClientCredential.deleteMany({ where: { clientUserId: user.id } });
  await prisma.neptivePortalSession.deleteMany({ where: { clientUserId: user.id } });
  if (setup) await prisma.neptiveClientCredential.create({ data: { ...base, passwordHash: 'CLIENT-OLD', source: 'CLIENT' } });
  let open;
  const gate = new Promise((r) => (open = r));
  const agency = agencyHolding(kind, gate);
  await sleep(300); // agency has written, not committed
  const t0 = Date.now();
  const client = clientChange(expectedHash);
  await sleep(700); // the client's statement is now waiting on the agency's lock
  open();
  await agency;
  const result = await client;
  const waited = Date.now() - t0;
  const row = await prisma.neptiveClientCredential.findUnique({ where: { clientUserId: user.id } });
  const live = await prisma.neptivePortalSession.count({ where: { clientUserId: user.id, revokedAt: null } });
  check(`${label}: client write blocked ${waited} ms then matched nothing (conflict)`, result === null && waited >= 600, `result ${result ? 'session' : 'null'}`);
  check(`${label}: ${expect}`, kind === 'reset' ? row?.passwordHash === 'AGENCY-TEMP' && row.mustChange : row === null, JSON.stringify(row && { hash: row.passwordHash, mustChange: row.mustChange }));
  check(`${label}: no live session for the user`, live === 0, `${live}`);
}

try {
  await scenario('agency reset during a client change', true, 'reset', 'CLIENT-OLD', 'the temporary password stands');
  await scenario('agency removal during a client change', true, 'remove', 'CLIENT-OLD', 'no credential');
  await scenario('agency reset during a first client password', false, 'reset', null, 'the temporary password stands');
  // and without an agency action the same write goes through
  await prisma.neptiveClientCredential.deleteMany({ where: { clientUserId: user.id } });
  await prisma.neptiveClientCredential.create({ data: { ...base, passwordHash: 'CLIENT-OLD', source: 'CLIENT' } });
  const ok = await clientChange('CLIENT-OLD');
  const row = await prisma.neptiveClientCredential.findUnique({ where: { clientUserId: user.id } });
  check('no race: the client change is written and opens one session', !!ok && row.passwordHash === 'CLIENT-NEW');
} finally {
  await prisma.neptivePortalSession.deleteMany({ where: { clientUserId: user.id } });
  await prisma.neptiveClientCredential.deleteMany({ where: { clientUserId: user.id } });
  await prisma.neptiveClientUser.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}
console.log(failures ? `${failures} FAILED` : 'all checks passed');
process.exit(failures ? 1 : 0);
