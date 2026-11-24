jest.mock('@gitroom/nestjs-libraries/neptive/repositories/neptive.repository', () => ({
  NeptiveRepository: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter', () => ({
  PostizAdapter: class {},
}));
jest.mock('@gitroom/nestjs-libraries/services/email.service', () => ({
  EmailService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/repositories/credential.repository', () => ({
  NeptiveCredentialRepository: class {},
  CREDENTIAL_SUMMARY_SELECT: { clientUserId: true, source: true, mustChange: true, updatedAt: true },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { HttpException } from '@nestjs/common';
import { hashSync } from 'bcrypt';
import {
  NEPTIVE_DEVICE_COOKIE,
  NeptivePortalAuthService,
} from './portal-auth.service';
import {
  INVALID_CREDENTIALS,
  NEPTIVE_LOGIN_LIMITS,
  NEPTIVE_LOGIN_WINDOW_MS,
  NeptivePortalCredentialsService,
} from './portal-credentials.service';
import { hashNeptiveToken } from '../domain/tokens';
import { emailFingerprint } from '../domain/credentials';
import { allowedDuringPasswordChange, sameOriginProblem } from '../auth/request-guards';
import { NeptiveClientService } from './client.service';

process.env.JWT_SECRET = 'test-secret-for-neptive-credentials';
process.env.FRONTEND_URL = 'https://portal.neptive.com';
delete process.env.NOT_SECURED;

// ------------------------------------------------------------------ in-memory database

let now = Date.parse('2026-11-24T10:00:00Z');
const realNow = Date.now;

type User = {
  id: string;
  orgId: string;
  customerId: string;
  email: string;
  name: string;
  role: string;
  activated: boolean;
  deletedAt: Date | null;
  lastLoginAt: Date | null;
};

function world() {
  const customers = [
    { id: 'cust-a', orgId: 'org-1', name: 'Casa Pandora', deletedAt: null as Date | null },
    { id: 'cust-b', orgId: 'org-1', name: 'Vigar2', deletedAt: null as Date | null },
  ];
  const users: User[] = [];
  const credentials: any[] = [];
  const sessions: any[] = [];
  const magicLinks: any[] = [];
  const attempts: Array<{ bucket: string; createdAt: Date }> = [];
  const activities: any[] = [];
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;

  const addUser = (data: Partial<User> & { customerId: string; email: string }) => {
    const user: User = {
      id: id('user'),
      orgId: 'org-1',
      name: data.email.split('@')[0],
      role: 'CLIENT_ADMIN',
      activated: true,
      deletedAt: null,
      lastLoginAt: null,
      ...data,
    };
    users.push(user);
    return user;
  };
  const setPassword = (user: User, password: string, mustChange = false) => {
    const row = credentials.find((c) => c.clientUserId === user.id);
    const data = {
      clientUserId: user.id,
      orgId: user.orgId,
      customerId: user.customerId,
      passwordHash: hashSync(password, 4),
      source: mustChange ? 'AGENCY' : 'CLIENT',
      mustChange,
      setByUserId: null,
      updatedAt: new Date(now),
    };
    if (row) Object.assign(row, data);
    else credentials.push({ id: id('cred'), ...data });
  };

  const organizations = [{ id: 'org-1', deletedAt: null as Date | null }];
  const repo = {
    customerInOrg: async (orgId: string, customerId: string) =>
      customers.find((c) => c.id === customerId && c.orgId === orgId && !c.deletedAt) || null,
    liveOrganization: async (orgId: string) => organizations.find((o) => o.id === orgId && !o.deletedAt) || null,
    softDeleteCustomer: async (orgId: string, customerId: string) => {
      const customer = customers.find((c) => c.id === customerId && c.orgId === orgId);
      if (customer) customer.deletedAt = new Date(now);
      return { count: customer ? 1 : 0 };
    },
    revokeCustomerSessions: async (orgId: string, customerId: string) => {
      const live = sessions.filter((s) => s.orgId === orgId && s.customerId === customerId && !s.revokedAt);
      live.forEach((s) => (s.revokedAt = new Date(now)));
      return { count: live.length };
    },
    clientUserById: async (orgId: string, customerId: string, userId: string) =>
      users.find((u) => u.id === userId && u.orgId === orgId && u.customerId === customerId && !u.deletedAt) || null,
    listClientUsers: async (orgId: string, customerId: string) =>
      users.filter((u) => u.orgId === orgId && u.customerId === customerId && !u.deletedAt),
    touchClientLogin: async (userId: string) => {
      const user = users.find((u) => u.id === userId)!;
      user.lastLoginAt = new Date(now);
      return user;
    },
    createActivity: async (data: any) => {
      activities.push(data);
      return data;
    },
    sessionByHash: async (tokenHash: string) => {
      const session = sessions.find(
        (s) => s.tokenHash === tokenHash && !s.revokedAt && s.expiresAt.getTime() > now
      );
      return session ? { ...session, clientUser: users.find((u) => u.id === session.clientUserId) } : null;
    },
    magicLinkByHash: async (tokenHash: string) => {
      const link = magicLinks.find((l) => l.tokenHash === tokenHash);
      return link ? { ...link, clientUser: users.find((u) => u.id === link.clientUserId) } : null;
    },
    consumeMagicLink: async (linkId: string) => {
      const link = magicLinks.find((l) => l.id === linkId && !l.consumedAt);
      if (link) link.consumedAt = new Date(now);
      return { count: link ? 1 : 0 };
    },
    createSession: async (data: any) => {
      const row = { id: id('sess'), revokedAt: null, passwordChangeRequired: false, ...data };
      sessions.push(row);
      return row;
    },
    revokeSession: async (sessionId: string) => {
      sessions.find((s) => s.id === sessionId).revokedAt = new Date(now);
    },
  };

  const credentialRepo = {
    loginCandidates: async (email: string) =>
      users
        .filter((u) => u.email === email && !u.deletedAt && u.activated)
        .map((u) => ({
          u,
          c: credentials.find((c) => c.clientUserId === u.id),
          cust: customers.find((c) => c.id === u.customerId && c.orgId === u.orgId && !c.deletedAt && organizations.some((o) => o.id === c.orgId && !o.deletedAt)),
        }))
        .filter((r) => r.c && r.cust)
        .map(({ u, c, cust }) => ({
          id: u.id,
          orgId: u.orgId,
          customerId: u.customerId,
          customerName: cust!.name,
          email: u.email,
          name: u.name,
          passwordHash: c.passwordHash,
          mustChange: c.mustChange,
        })),
    liveUsersByEmail: async (email: string) =>
      users.filter((u) => u.email === email && !u.deletedAt).map(({ id, orgId, customerId, name }) => ({ id, orgId, customerId, name })),
    credentialForUser: async (clientUserId: string) => credentials.find((c) => c.clientUserId === clientUserId) || null,
    credentialSummary: async (clientUserId: string) => {
      const c = credentials.find((row) => row.clientUserId === clientUserId);
      return c ? { clientUserId, source: c.source, mustChange: c.mustChange, updatedAt: c.updatedAt } : null;
    },
    credentialSummaries: async (orgId: string, customerId: string) =>
      credentials
        .filter((c) => c.orgId === orgId && c.customerId === customerId)
        .map((c) => ({ clientUserId: c.clientUserId, source: c.source, mustChange: c.mustChange, updatedAt: c.updatedAt })),
    // same contract as NeptiveCredentialRepository: each call is one transaction; the client write is
    // conditional on the hash it proved (or on the row still being absent)
    replaceOwnCredential: async (input: any) => {
      const row = credentials.find((c) => c.clientUserId === input.clientUserId);
      if (input.expectedHash ? !row || row.passwordHash !== input.expectedHash : !!row) {
        return null;
      }
      const data = { passwordHash: input.passwordHash, source: 'CLIENT', mustChange: false, setByUserId: null, updatedAt: new Date(now) };
      if (row) Object.assign(row, data);
      else credentials.push({ id: id('cred'), clientUserId: input.clientUserId, orgId: input.orgId, customerId: input.customerId, ...data });
      sessions.filter((s) => s.clientUserId === input.clientUserId && !s.revokedAt).forEach((s) => (s.revokedAt = new Date(now)));
      return repo.createSession({
        tokenHash: input.session.tokenHash,
        clientUserId: input.clientUserId,
        customerId: input.customerId,
        orgId: input.orgId,
        expiresAt: input.session.expiresAt,
        passwordChangeRequired: false,
      });
    },
    setAgencyCredential: async (input: any) => {
      const data = { passwordHash: input.passwordHash, source: 'AGENCY', mustChange: true, setByUserId: input.setByUserId, updatedAt: new Date(now) };
      const row = credentials.find((c) => c.clientUserId === input.clientUserId);
      if (row) Object.assign(row, data);
      else credentials.push({ id: id('cred'), clientUserId: input.clientUserId, orgId: input.orgId, customerId: input.customerId, ...data });
      sessions.filter((s) => s.clientUserId === input.clientUserId && !s.revokedAt).forEach((s) => (s.revokedAt = new Date(now)));
      const saved = credentials.find((c) => c.clientUserId === input.clientUserId);
      return { clientUserId: saved.clientUserId, source: saved.source, mustChange: saved.mustChange, updatedAt: saved.updatedAt };
    },
    removeCredential: async (clientUserId: string) => {
      const index = credentials.findIndex((c) => c.clientUserId === clientUserId);
      if (index >= 0) {
        credentials.splice(index, 1);
        sessions.filter((s) => s.clientUserId === clientUserId && !s.revokedAt).forEach((s) => (s.revokedAt = new Date(now)));
      }
      return { count: index >= 0 ? 1 : 0 };
    },
    deleteCredential: async (clientUserId: string) => {
      const index = credentials.findIndex((c) => c.clientUserId === clientUserId);
      if (index >= 0) credentials.splice(index, 1);
      return { count: index >= 0 ? 1 : 0 };
    },
    createSession: repo.createSession,
    failures: async (bucket: string, since: Date) => {
      const rows = attempts.filter((a) => a.bucket === bucket && a.createdAt > since);
      return { count: rows.length, oldest: rows.length ? rows[0].createdAt : null };
    },
    addFailures: async (buckets: string[]) => {
      buckets.forEach((bucket) => attempts.push({ bucket, createdAt: new Date(now) }));
    },
  };

  const auth = new NeptivePortalAuthService(repo as any, credentialRepo as any);
  const service = new NeptivePortalCredentialsService(repo as any, credentialRepo as any, auth);
  return { customers, organizations, users, credentials, sessions, magicLinks, attempts, activities, repo, credentialRepo, auth, service, addUser, setPassword };
}

function response() {
  const cookies: Record<string, string> = {};
  const headers: Record<string, string> = {};
  return {
    cookies,
    headers,
    cookie: jest.fn((name: string, value: string, options: any) => {
      cookies[name] = value;
      (cookies as any)[`${name}:options`] = options;
    }),
    header: jest.fn((name: string, value: string) => (headers[name] = value)),
    setHeader: jest.fn((name: string, value: string) => (headers[name] = value)),
  } as any;
}

const IP = '203.0.113.7';

async function status(promise: Promise<unknown>) {
  try {
    await promise;
    return 200;
  } catch (error) {
    if (error instanceof HttpException) return error.getStatus();
    throw error;
  }
}

beforeEach(() => {
  now = Date.parse('2026-11-24T10:00:00Z');
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => {
  jest.restoreAllMocks();
  Date.now = realNow;
});

// ------------------------------------------------------------------ hashing and login

describe('portal password login', () => {
  it('stores only a bcrypt hash and logs in with the right password, opening a normal portal session', async () => {
    const w = world();
    const user = w.addUser({ customerId: 'cust-a', email: 'anna@casapandora.it' });
    const res = response();
    // the client sets the password from a magic-link session
    const magicSession = await w.repo.createSession({ tokenHash: 'x', clientUserId: user.id, customerId: 'cust-a', orgId: 'org-1', expiresAt: new Date(now + 1e9) });
    await w.service.changeOwnPassword(
      { sessionId: magicSession.id, clientUserId: user.id, customerId: 'cust-a', orgId: 'org-1', email: user.email, name: user.name, role: 'CLIENT_ADMIN', passwordChangeRequired: false },
      { newPassword: 'Gelato al pistacchio 7' },
      res
    );
    const stored = w.credentials[0];
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(JSON.stringify(w.credentials)).not.toContain('pistacchio');

    const login = response();
    const result = await w.service.login({ email: ' Anna@CasaPandora.it ', password: 'Gelato al pistacchio 7' }, { ip: IP }, login);
    expect(result).toEqual({ ok: true, passwordChangeRequired: false });
    const identity = await w.auth.resolve(login.cookies.neptive_portal);
    expect(identity).toMatchObject({ clientUserId: user.id, customerId: 'cust-a', orgId: 'org-1', passwordChangeRequired: false });
    const session = w.sessions.find((s) => s.id === identity.sessionId);
    expect(session.expiresAt.getTime() - now).toBe(30 * 24 * 60 * 60 * 1000);
    expect(login.cookies[NEPTIVE_DEVICE_COOKIE]).toBeTruthy();
    expect(user.lastLoginAt).toEqual(new Date(now));
  });

  it('gives one generic 401 for unknown email, wrong password, no password, deactivated, deleted user, deleted customer', async () => {
    const w = world();
    const ok = w.addUser({ customerId: 'cust-a', email: 'ok@a.it' });
    w.setPassword(ok, 'Una password lunga 1');
    w.addUser({ customerId: 'cust-a', email: 'nopassword@a.it' });
    const off = w.addUser({ customerId: 'cust-a', email: 'off@a.it', activated: false });
    w.setPassword(off, 'Una password lunga 1');
    const gone = w.addUser({ customerId: 'cust-a', email: 'gone@a.it', deletedAt: new Date() });
    w.setPassword(gone, 'Una password lunga 1');
    const orphan = w.addUser({ customerId: 'cust-b', email: 'orphan@b.it' });
    w.setPassword(orphan, 'Una password lunga 1');
    w.customers[1].deletedAt = new Date();

    const cases = [
      ['nobody@a.it', 'Una password lunga 1'],
      ['ok@a.it', 'Una password sbagliata'],
      ['nopassword@a.it', 'Una password lunga 1'],
      ['off@a.it', 'Una password lunga 1'],
      ['gone@a.it', 'Una password lunga 1'],
      ['orphan@b.it', 'Una password lunga 1'],
      ['', ''],
    ];
    for (const [email, password] of cases) {
      const error = await w.service.login({ email, password }, { ip: `198.51.100.${cases.indexOf([email, password] as any) + 1}` }, response()).catch((e) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(401);
      expect(error.getResponse()).toEqual({ message: INVALID_CREDENTIALS, error: 'Unauthorized', statusCode: 401 });
    }
  });

  it('spends the same number of bcrypt comparisons whatever the email (no timing enumeration)', async () => {
    const bcrypt = require('bcrypt');
    const spy = jest.spyOn(bcrypt, 'compare');
    const w = world();
    const ok = w.addUser({ customerId: 'cust-a', email: 'ok@a.it' });
    w.setPassword(ok, 'Una password lunga 1');
    w.addUser({ customerId: 'cust-a', email: 'nopassword@a.it' });
    const counts: number[] = [];
    for (const email of ['nobody@a.it', 'ok@a.it', 'nopassword@a.it']) {
      spy.mockClear();
      await w.service.login({ email, password: 'sbagliata sbagliata' }, { ip: IP }, response()).catch(() => undefined);
      counts.push(spy.mock.calls.length);
    }
    expect(counts).toEqual([2, 2, 2]);
  });
});

// ------------------------------------------------------------------ same email under two customers

describe('same email under two customers', () => {
  it('lands in the customer whose password matches, never the other one', async () => {
    const w = world();
    const a = w.addUser({ customerId: 'cust-a', email: 'marco@studio.it' });
    const b = w.addUser({ customerId: 'cust-b', email: 'marco@studio.it' });
    w.setPassword(a, 'Password di Casa Pandora');
    w.setPassword(b, 'Password per Vigar2 ok');
    const resA = response();
    expect(await w.service.login({ email: 'marco@studio.it', password: 'Password di Casa Pandora' }, { ip: IP }, resA)).toEqual({ ok: true, passwordChangeRequired: false });
    expect((await w.auth.resolve(resA.cookies.neptive_portal)).customerId).toBe('cust-a');
    const resB = response();
    await w.service.login({ email: 'marco@studio.it', password: 'Password per Vigar2 ok' }, { ip: IP }, resB);
    expect((await w.auth.resolve(resB.cookies.neptive_portal)).customerId).toBe('cust-b');
  });

  it('with the same password on both, asks which one (only after the password matched) and opens only the chosen one', async () => {
    const w = world();
    const a = w.addUser({ customerId: 'cust-a', email: 'marco@studio.it' });
    const b = w.addUser({ customerId: 'cust-b', email: 'marco@studio.it' });
    w.setPassword(a, 'Stessa password 2026');
    w.setPassword(b, 'Stessa password 2026');
    const first = response();
    const choice: any = await w.service.login({ email: 'marco@studio.it', password: 'Stessa password 2026' }, { ip: IP }, first);
    expect(choice.chooseAccount).toEqual([
      { account: a.id, label: 'Casa Pandora' },
      { account: b.id, label: 'Vigar2' },
    ]);
    expect(first.cookies.neptive_portal).toBeUndefined();
    // a wrong password never shows the list
    expect(await status(w.service.login({ email: 'marco@studio.it', password: 'wrong wrong wrong' }, { ip: IP }, response()))).toBe(401);
    // choosing B
    const second = response();
    await w.service.login({ email: 'marco@studio.it', password: 'Stessa password 2026', account: b.id }, { ip: IP }, second);
    expect((await w.auth.resolve(second.cookies.neptive_portal)).customerId).toBe('cust-b');
    // an account id of another email (or a guessed id) is just a failed login
    const other = w.addUser({ customerId: 'cust-a', email: 'altro@a.it' });
    w.setPassword(other, 'Stessa password 2026');
    expect(await status(w.service.login({ email: 'marco@studio.it', password: 'Stessa password 2026', account: other.id }, { ip: IP }, response()))).toBe(401);
  });
});

// ------------------------------------------------------------------ throttling

describe('throttling', () => {
  it(`locks the account after ${NEPTIVE_LOGIN_LIMITS.email} failures for 15 minutes, then releases it; records the activity`, async () => {
    const w = world();
    const user = w.addUser({ customerId: 'cust-a', email: 'anna@a.it', name: 'Anna' });
    w.setPassword(user, 'La password giusta 1');
    for (let i = 0; i < NEPTIVE_LOGIN_LIMITS.email; i++) {
      // different IPs: the per-account bucket alone must trip
      expect(await status(w.service.login({ email: 'anna@a.it', password: 'sbagliata ' + i }, { ip: `10.0.0.${i}` }, response()))).toBe(401);
      now += 1000;
    }
    const blocked = response();
    const error = await w.service.login({ email: 'anna@a.it', password: 'La password giusta 1' }, { ip: '10.0.1.1' }, blocked).catch((e) => e);
    expect(error.getStatus()).toBe(429);
    expect(Number(blocked.headers['Retry-After'])).toBeGreaterThan(14 * 60);
    expect(blocked.cookies.neptive_portal).toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    expect(w.activities.filter((a) => a.type === 'CLIENT_LOGIN_THROTTLED')).toHaveLength(1);
    expect(w.activities[0]).toMatchObject({ visibility: 'INTERNAL', customerId: 'cust-a' });
    expect(JSON.stringify(w.activities)).not.toMatch(/sbagliata|giusta|\$2b\$/);
    // attempts while locked are not stored (they cannot extend the lock)
    const stored = w.attempts.length;
    await w.service.login({ email: 'anna@a.it', password: 'x x x x x x' }, { ip: '10.0.1.1' }, response()).catch(() => undefined);
    expect(w.attempts.length).toBe(stored);
    // 15 minutes after the first failure the window has moved on
    now += NEPTIVE_LOGIN_WINDOW_MS;
    expect(await w.service.login({ email: 'anna@a.it', password: 'La password giusta 1' }, { ip: '10.0.1.1' }, response())).toEqual({ ok: true, passwordChangeRequired: false });
  });

  it('a browser that already logged in for this email keeps working while the account is locked', async () => {
    const w = world();
    const user = w.addUser({ customerId: 'cust-a', email: 'anna@a.it' });
    w.setPassword(user, 'La password giusta 1');
    const own = response();
    await w.service.login({ email: 'anna@a.it', password: 'La password giusta 1' }, { ip: IP }, own);
    const device = own.cookies[NEPTIVE_DEVICE_COOKIE];
    // attacker locks the account from elsewhere
    for (let i = 0; i < NEPTIVE_LOGIN_LIMITS.email; i++) {
      await w.service.login({ email: 'anna@a.it', password: 'attacco ' + i }, { ip: '192.0.2.66' }, response()).catch(() => undefined);
    }
    expect(await status(w.service.login({ email: 'anna@a.it', password: 'La password giusta 1' }, { ip: '192.0.2.67' }, response()))).toBe(429);
    // the client's own browser
    expect(await w.service.login({ email: 'anna@a.it', password: 'La password giusta 1' }, { ip: IP, deviceCookie: device }, response())).toEqual({ ok: true, passwordChangeRequired: false });
    // a device cookie issued for another email does not help
    const other = response();
    w.auth.setDeviceCookie(other, 'dev-x', emailFingerprint('someone@else.it'));
    expect(await status(w.service.login({ email: 'anna@a.it', password: 'La password giusta 1' }, { ip: IP, deviceCookie: other.cookies[NEPTIVE_DEVICE_COOKIE] }, response()))).toBe(429);
    // a forged cookie neither
    expect(await status(w.service.login({ email: 'anna@a.it', password: 'La password giusta 1' }, { ip: IP, deviceCookie: device.slice(0, -3) + 'abc' }, response()))).toBe(429);
  });

  it(`locks an IP after ${NEPTIVE_LOGIN_LIMITS.ip} failures across emails`, async () => {
    const w = world();
    for (let i = 0; i < NEPTIVE_LOGIN_LIMITS.ip; i++) {
      expect(await status(w.service.login({ email: `u${i}@a.it`, password: 'nope nope nope' }, { ip: IP }, response()))).toBe(401);
    }
    expect(await status(w.service.login({ email: 'fresh@a.it', password: 'nope nope nope' }, { ip: IP }, response()))).toBe(429);
    expect(await status(w.service.login({ email: 'fresh@a.it', password: 'nope nope nope' }, { ip: '198.51.100.1' }, response()))).toBe(401);
  });

  it('parallel guesses cannot run past the limit', async () => {
    const w = world();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => status(w.service.login({ email: 'anna@a.it', password: 'parallel ' + i }, { ip: `10.1.0.${i}` }, response())))
    );
    expect(results.filter((code) => code === 401).length).toBeLessThanOrEqual(NEPTIVE_LOGIN_LIMITS.email);
    expect(w.attempts.filter((a) => a.bucket === w.attempts[0].bucket).length).toBeLessThanOrEqual(NEPTIVE_LOGIN_LIMITS.email);
  });
});

// ------------------------------------------------------------------ temporary password, forced change, sessions

describe('temporary password and sessions', () => {
  it('agency temporary password: shown once, forces a change, restricted short session, ends other sessions', async () => {
    const w = world();
    const user = w.addUser({ customerId: 'cust-a', email: 'anna@a.it', name: 'Anna' });
    const old = await w.repo.createSession({ tokenHash: 'old', clientUserId: user.id, customerId: 'cust-a', orgId: 'org-1', expiresAt: new Date(now + 1e9) });
    const issued = await w.service.issueTemporaryPassword('org-1', 'cust-a', user.id, 'agency-user-1');
    expect(issued.password).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
    expect(JSON.stringify(issued)).not.toMatch(/\$2[aby]\$/);
    expect(old.revokedAt).toBeTruthy();
    expect(w.activities.at(-1)).toMatchObject({ type: 'CLIENT_PASSWORD_RESET', visibility: 'INTERNAL', performedByUserId: 'agency-user-1' });
    expect(JSON.stringify(w.activities)).not.toContain(issued.password);

    const res = response();
    expect(await w.service.login({ email: 'anna@a.it', password: issued.password }, { ip: IP }, res)).toEqual({ ok: true, passwordChangeRequired: true });
    const restricted = await w.auth.resolve(res.cookies.neptive_portal);
    expect(restricted.passwordChangeRequired).toBe(true);
    const row = w.sessions.find((s) => s.id === restricted.sessionId);
    expect(row.expiresAt.getTime() - now).toBe(30 * 60 * 1000);
    // the portal middleware lets this session reach only /me and the password change
    expect(allowedDuringPasswordChange('GET', '/neptive/portal/me')).toBe(true);
    expect(allowedDuringPasswordChange('POST', '/neptive/portal/account/password')).toBe(true);
    for (const [method, path] of [
      ['GET', '/neptive/portal/dashboard'],
      ['GET', '/neptive/portal/peds'],
      ['GET', '/neptive/portal/approvals/abc'],
      ['POST', '/neptive/portal/approvals/abc/transition'],
      ['GET', '/neptive/portal/me/'],
      ['GET', '/neptive/portal//peds'],
      ['GET', '/neptive/portal/%6De'],
      ['POST', '/neptive/portal/me'],
    ]) {
      expect(allowedDuringPasswordChange(method, path)).toBe(false);
    }

    // forced change: no current password needed (this session just proved the temporary one)
    const changed = response();
    await w.service.changeOwnPassword(restricted, { newPassword: 'La mia password nuova' }, changed);
    expect(w.sessions.find((s) => s.id === restricted.sessionId).revokedAt).toBeTruthy();
    const fresh = await w.auth.resolve(changed.cookies.neptive_portal);
    expect(fresh.passwordChangeRequired).toBe(false);
    expect(w.credentials[0]).toMatchObject({ mustChange: false, source: 'CLIENT', setByUserId: null });
    // the temporary password no longer works
    expect(await status(w.service.login({ email: 'anna@a.it', password: issued.password }, { ip: '10.9.9.9' }, response()))).toBe(401);
    expect(w.activities.at(-1)).toMatchObject({ type: 'CLIENT_PASSWORD_CHANGED' });
  });

  it('changing the password needs the current one and ends every other session of that user only', async () => {
    const w = world();
    const user = w.addUser({ customerId: 'cust-a', email: 'anna@a.it' });
    const colleague = w.addUser({ customerId: 'cust-a', email: 'luca@a.it' });
    w.setPassword(user, 'Password attuale 123');
    const phone = response();
    await w.service.login({ email: 'anna@a.it', password: 'Password attuale 123' }, { ip: IP }, phone);
    const laptop = response();
    await w.service.login({ email: 'anna@a.it', password: 'Password attuale 123' }, { ip: IP }, laptop);
    const colleagueSession = await w.repo.createSession({ tokenHash: 'c', clientUserId: colleague.id, customerId: 'cust-a', orgId: 'org-1', expiresAt: new Date(now + 1e9) });
    const laptopIdentity = await w.auth.resolve(laptop.cookies.neptive_portal);

    expect(await status(w.service.changeOwnPassword(laptopIdentity, { newPassword: 'Nuova password 456' }, response()))).toBe(400);
    const wrong = await w.service.changeOwnPassword(laptopIdentity, { currentPassword: 'non è questa', newPassword: 'Nuova password 456' }, response()).catch((e) => e);
    expect(wrong.getResponse().message).toBe('CURRENT_PASSWORD_WRONG');
    const same = await w.service.changeOwnPassword(laptopIdentity, { currentPassword: 'Password attuale 123', newPassword: 'Password attuale 123' }, response()).catch((e) => e);
    expect(same.getResponse().message).toBe('PASSWORD_SAME_AS_CURRENT');

    const after = response();
    await w.service.changeOwnPassword(laptopIdentity, { currentPassword: 'Password attuale 123', newPassword: 'Nuova password 456' }, after);
    await expect(w.auth.resolve(phone.cookies.neptive_portal)).rejects.toThrow();
    await expect(w.auth.resolve(laptop.cookies.neptive_portal)).rejects.toThrow();
    expect((await w.auth.resolve(after.cookies.neptive_portal)).clientUserId).toBe(user.id);
    expect(colleagueSession.revokedAt).toBeNull();
  });

  // the client's change reads + verifies the credential, then hashes the new password (slow, ~70 ms in
  // production) and writes; the agency acts in that window. bcrypt.hash is the hook for the interleaving.
  async function interleave(agencyAction: (w: ReturnType<typeof world>, userId: string) => Promise<unknown>, withPassword = true) {
    const bcrypt = require('bcrypt');
    const realHash = bcrypt.hash;
    const w = world();
    const user = w.addUser({ customerId: 'cust-a', email: 'anna@a.it', name: 'Anna' });
    if (withPassword) w.setPassword(user, 'Password attuale 123');
    const session = await w.repo.createSession({ tokenHash: 'own', clientUserId: user.id, customerId: 'cust-a', orgId: 'org-1', expiresAt: new Date(now + 1e9) });
    const identity = { sessionId: session.id, clientUserId: user.id, customerId: 'cust-a', orgId: 'org-1', email: user.email, name: user.name, role: 'CLIENT_ADMIN', passwordChangeRequired: false };
    let agencyResult: any;
    let fired = false;
    jest.spyOn(bcrypt, 'hash').mockImplementation(async (...args: any[]) => {
      if (!fired && args[0] === 'Password del cliente 9') {
        fired = true;
        agencyResult = await agencyAction(w, user.id);
      }
      return realHash(...args);
    });
    const res = response();
    const error = await w.service
      .changeOwnPassword(identity, { ...(withPassword ? { currentPassword: 'Password attuale 123' } : {}), newPassword: 'Password del cliente 9' }, res)
      .catch((e) => e);
    return { w, user, session, res, error, agencyResult };
  }

  it('race: agency temporary password lands while the client is changing hers -> the client change fails (409), the temporary password stands', async () => {
    const { w, user, session, res, error, agencyResult } = await interleave((w, id) => w.service.issueTemporaryPassword('org-1', 'cust-a', id, 'agency-user-1'));
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse().message).toBe('PASSWORD_CHANGED_ELSEWHERE');
    expect(w.credentials).toHaveLength(1);
    expect(w.credentials[0]).toMatchObject({ source: 'AGENCY', mustChange: true });
    expect(res.cookies.neptive_portal).toBeUndefined();
    expect(session.revokedAt).toBeTruthy();
    expect(w.sessions.filter((s) => s.clientUserId === user.id && !s.revokedAt)).toHaveLength(0);
    expect((await w.service.login({ email: 'anna@a.it', password: agencyResult.password }, { ip: IP }, response())) as any).toEqual({ ok: true, passwordChangeRequired: true });
    expect(await status(w.service.login({ email: 'anna@a.it', password: 'Password del cliente 9' }, { ip: '10.0.0.9' }, response()))).toBe(401);
  });

  it('race: agency removes the password while the client is changing it -> 409, no password comes back', async () => {
    const { w, user, error } = await interleave((w, id) => w.service.removePassword('org-1', 'cust-a', id, 'agency-user-1'));
    expect(error.getStatus()).toBe(409);
    expect(w.credentials).toHaveLength(0);
    expect(w.sessions.filter((s) => s.clientUserId === user.id && !s.revokedAt)).toHaveLength(0);
    expect(await status(w.service.login({ email: 'anna@a.it', password: 'Password del cliente 9' }, { ip: IP }, response()))).toBe(401);
  });

  it('race: agency temporary password lands while the client sets her first password -> 409, the temporary password stands', async () => {
    const { w, error } = await interleave((w, id) => w.service.issueTemporaryPassword('org-1', 'cust-a', id), false);
    expect(error.getStatus()).toBe(409);
    expect(w.credentials).toHaveLength(1);
    expect(w.credentials[0]).toMatchObject({ source: 'AGENCY', mustChange: true });
  });

  it('no race: the same change goes through', async () => {
    const { w, res, error: result } = await interleave(async () => undefined);
    expect(result).toEqual({ ok: true });
    expect(w.credentials[0]).toMatchObject({ source: 'CLIENT', mustChange: false });
    expect(res.cookies.neptive_portal).toBeTruthy();
  });

  it('throttles wrong current passwords on the account page', async () => {
    const w = world();
    const user = w.addUser({ customerId: 'cust-a', email: 'anna@a.it' });
    w.setPassword(user, 'Password attuale 123');
    const res = response();
    await w.service.login({ email: 'anna@a.it', password: 'Password attuale 123' }, { ip: IP }, res);
    const identity = await w.auth.resolve(res.cookies.neptive_portal);
    for (let i = 0; i < NEPTIVE_LOGIN_LIMITS.change; i++) {
      expect(await status(w.service.changeOwnPassword(identity, { currentPassword: 'tentativo ' + i, newPassword: 'Nuova password 456' }, response()))).toBe(400);
    }
    expect(await status(w.service.changeOwnPassword(identity, { currentPassword: 'Password attuale 123', newPassword: 'Nuova password 456' }, response()))).toBe(429);
  });

  it('agency remove: password login stops, sessions end, a magic link still works', async () => {
    const w = world();
    const user = w.addUser({ customerId: 'cust-a', email: 'anna@a.it' });
    w.setPassword(user, 'Password attuale 123');
    const res = response();
    await w.service.login({ email: 'anna@a.it', password: 'Password attuale 123' }, { ip: IP }, res);
    expect(await w.service.removePassword('org-1', 'cust-a', user.id, 'agency-user-1')).toEqual({ ok: true, removed: true });
    await expect(w.auth.resolve(res.cookies.neptive_portal)).rejects.toThrow();
    expect(await status(w.service.login({ email: 'anna@a.it', password: 'Password attuale 123' }, { ip: IP }, response()))).toBe(401);
    w.magicLinks.push({ id: 'ml-1', tokenHash: hashNeptiveToken('magic-token'), clientUserId: user.id, customerId: 'cust-a', orgId: 'org-1', expiresAt: new Date(now + 1e9), consumedAt: null });
    const magic = response();
    await w.auth.consumeMagicLink('magic-token', magic);
    expect((await w.auth.resolve(magic.cookies.neptive_portal)).customerId).toBe('cust-a');
    expect(w.activities.at(-1)).toMatchObject({ type: 'CLIENT_PASSWORD_REMOVED' });
  });

  it('agency actions are scoped to the agency org and the customer in the URL', async () => {
    const w = world();
    const user = w.addUser({ customerId: 'cust-a', email: 'anna@a.it' });
    expect(await status(w.service.issueTemporaryPassword('org-1', 'cust-b', user.id))).toBe(404);
    expect(await status(w.service.issueTemporaryPassword('org-2', 'cust-a', user.id))).toBe(404);
    expect(await status(w.service.removePassword('org-1', 'cust-b', user.id))).toBe(404);
    expect(w.credentials).toHaveLength(0);
  });

  it('deactivated or deleted users: no login, and their existing sessions stop resolving', async () => {
    const w = world();
    const user = w.addUser({ customerId: 'cust-a', email: 'anna@a.it' });
    w.setPassword(user, 'Password attuale 123');
    const res = response();
    await w.service.login({ email: 'anna@a.it', password: 'Password attuale 123' }, { ip: IP }, res);
    user.activated = false;
    await expect(w.auth.resolve(res.cookies.neptive_portal)).rejects.toThrow();
    expect(await status(w.service.login({ email: 'anna@a.it', password: 'Password attuale 123' }, { ip: IP }, response()))).toBe(401);
    user.activated = true;
    user.deletedAt = new Date();
    await expect(w.auth.resolve(res.cookies.neptive_portal)).rejects.toThrow();
    expect(await status(w.service.login({ email: 'anna@a.it', password: 'Password attuale 123' }, { ip: IP }, response()))).toBe(401);
  });
});

// ------------------------------------------------------------------ isolation, projections, cookies

describe('scope isolation with a password session', () => {
  it('binds the customer exactly like a magic-link session and refuses a tampered token', async () => {
    const w = world();
    const user = w.addUser({ customerId: 'cust-a', email: 'anna@a.it' });
    w.setPassword(user, 'Password attuale 123');
    const pwd = response();
    await w.service.login({ email: 'anna@a.it', password: 'Password attuale 123' }, { ip: IP }, pwd);
    w.magicLinks.push({ id: 'ml-1', tokenHash: hashNeptiveToken('t1'), clientUserId: user.id, customerId: 'cust-a', orgId: 'org-1', expiresAt: new Date(now + 1e9), consumedAt: null });
    const magic = response();
    await w.auth.consumeMagicLink('t1', magic);
    const a = await w.auth.resolve(pwd.cookies.neptive_portal);
    const b = await w.auth.resolve(magic.cookies.neptive_portal);
    const strip = ({ sessionId, ...rest }: any) => rest;
    expect(strip(a)).toEqual(strip(b));
    // same cookie attributes as the magic link
    expect(pwd.cookie.mock.calls.find((c: any[]) => c[0] === 'neptive_portal')[2]).toEqual(
      expect.objectContaining({ secure: true, httpOnly: true, sameSite: 'none' })
    );
    expect(pwd.cookie.mock.calls.find((c: any[]) => c[0] === NEPTIVE_DEVICE_COOKIE)[2]).toEqual(
      expect.objectContaining({ secure: true, httpOnly: true, sameSite: 'none' })
    );
    // a re-signed payload pointing at customer B is refused: the session row decides
    const jwt = require('jsonwebtoken');
    const payload = jwt.decode(pwd.cookies.neptive_portal);
    const forged = jwt.sign({ ...payload, customerId: 'cust-b' }, process.env.JWT_SECRET);
    await expect(w.auth.resolve(forged)).rejects.toThrow();
    // a device cookie is not a session
    await expect(w.auth.resolve(pwd.cookies[NEPTIVE_DEVICE_COOKIE])).rejects.toThrow();
  });
});

describe('sessions of a removed customer, user or organization', () => {
  async function loggedIn() {
    const w = world();
    const user = w.addUser({ customerId: 'cust-a', email: 'anna@a.it' });
    w.setPassword(user, 'Password attuale 123');
    const pwd = response();
    await w.service.login({ email: 'anna@a.it', password: 'Password attuale 123' }, { ip: IP }, pwd);
    w.magicLinks.push({ id: 'ml-1', tokenHash: hashNeptiveToken('t1'), clientUserId: user.id, customerId: 'cust-a', orgId: 'org-1', expiresAt: new Date(now + 1e9), consumedAt: null });
    const magic = response();
    await w.auth.consumeMagicLink('t1', magic);
    w.magicLinks.push({ id: 'ml-2', tokenHash: hashNeptiveToken('t2'), clientUserId: user.id, customerId: 'cust-a', orgId: 'org-1', expiresAt: new Date(now + 1e9), consumedAt: null });
    return { w, user, cookies: [pwd.cookies.neptive_portal, magic.cookies.neptive_portal] };
  }

  it('a soft-deleted customer: password and magic-link sessions stop resolving; no new login, no magic link', async () => {
    const { w, cookies } = await loggedIn();
    for (const cookie of cookies) expect((await w.auth.resolve(cookie)).customerId).toBe('cust-a');
    w.customers[0].deletedAt = new Date(now);
    for (const cookie of cookies) await expect(w.auth.resolve(cookie)).rejects.toThrow();
    expect(await status(w.service.login({ email: 'anna@a.it', password: 'Password attuale 123' }, { ip: IP }, response()))).toBe(401);
    expect(await status(w.auth.consumeMagicLink('t2', response()))).toBe(401);
  });

  it('deleting the customer from the agency revokes its sessions (and only its sessions)', async () => {
    const { w, cookies } = await loggedIn();
    const other = w.addUser({ customerId: 'cust-b', email: 'b@b.it' });
    const otherSession = await w.repo.createSession({ tokenHash: 'b', clientUserId: other.id, customerId: 'cust-b', orgId: 'org-1', expiresAt: new Date(now + 1e9) });
    const clients = new NeptiveClientService(w.repo as any, {} as any, {} as any, w.credentialRepo as any);
    expect(await clients.remove('org-1', 'cust-a')).toEqual({ ok: true });
    expect(w.sessions.filter((s) => s.customerId === 'cust-a').every((s) => s.revokedAt)).toBe(true);
    expect(otherSession.revokedAt).toBeNull();
    // even if the customer came back, the revoked rows stay dead
    w.customers[0].deletedAt = null;
    for (const cookie of cookies) await expect(w.auth.resolve(cookie)).rejects.toThrow();
  });

  it('a session whose user row no longer matches its customer or organization is refused', async () => {
    const { w, user, cookies } = await loggedIn();
    user.customerId = 'cust-b';
    for (const cookie of cookies) await expect(w.auth.resolve(cookie)).rejects.toThrow();
    user.customerId = 'cust-a';
    user.orgId = 'org-2';
    for (const cookie of cookies) await expect(w.auth.resolve(cookie)).rejects.toThrow();
    user.orgId = 'org-1';
    for (const cookie of cookies) expect((await w.auth.resolve(cookie)).customerId).toBe('cust-a');
    // the customer moved to another organization
    w.customers[0].orgId = 'org-2';
    for (const cookie of cookies) await expect(w.auth.resolve(cookie)).rejects.toThrow();
  });

  it('a soft-deleted organization: sessions refused, no password login', async () => {
    const { w, cookies } = await loggedIn();
    w.organizations[0].deletedAt = new Date(now);
    for (const cookie of cookies) await expect(w.auth.resolve(cookie)).rejects.toThrow();
    expect(await status(w.service.login({ email: 'anna@a.it', password: 'Password attuale 123' }, { ip: IP }, response()))).toBe(401);
  });
});

describe('no projection returns a password hash', () => {
  it('neptive_client_users has no password column; the credential summary select excludes the hash', () => {
    const schema = readFileSync(join(__dirname, '../../database/prisma/schema.prisma'), 'utf8');
    const userModel = schema.match(/model NeptiveClientUser \{([\s\S]*?)\n\}/)![1];
    expect(userModel).not.toMatch(/password/i);
    const repoSource = readFileSync(join(__dirname, '../repositories/credential.repository.ts'), 'utf8');
    const select = repoSource.match(/CREDENTIAL_SUMMARY_SELECT = \{([\s\S]*?)\}/)![1];
    expect(select).not.toMatch(/passwordHash/);
  });

  it('agency client detail, /me status, login and agency responses carry no hash', async () => {
    const w = world();
    const user = w.addUser({ customerId: 'cust-a', email: 'anna@a.it' });
    w.setPassword(user, 'Password attuale 123');
    const clients = new NeptiveClientService(
      { ...w.repo, profileByCustomer: async () => ({ branding: {} }), upsertProfile: async () => ({}) } as any,
      { integrationsForCustomer: async () => [] } as any,
      {} as any,
      w.credentialRepo as any
    );
    const detail = await clients.get('org-1', 'cust-a');
    expect(detail.users[0]).toMatchObject({ id: user.id, hasPassword: true, passwordTemporary: false });
    const outputs = [
      detail,
      await w.service.status(user.id),
      await w.service.login({ email: 'anna@a.it', password: 'Password attuale 123' }, { ip: IP }, response()),
      await w.service.issueTemporaryPassword('org-1', 'cust-a', user.id),
      await w.service.removePassword('org-1', 'cust-a', user.id),
    ];
    for (const output of outputs) {
      expect(JSON.stringify(output)).not.toMatch(/\$2[aby]\$|passwordHash/);
    }
  });
});

describe('request guards', () => {
  it('deleting a client user also deletes their password', async () => {
    const w = world();
    const user = w.addUser({ customerId: 'cust-a', email: 'anna@a.it' });
    w.setPassword(user, 'Password attuale 123');
    const clients = new NeptiveClientService(
      { ...w.repo, softDeleteClientUser: async () => { user.deletedAt = new Date(now); return { count: 1 }; } } as any,
      {} as any,
      {} as any,
      w.credentialRepo as any
    );
    await clients.removeUser('org-1', 'cust-a', user.id);
    expect(w.credentials).toHaveLength(0);
    expect(await status(w.service.login({ email: 'anna@a.it', password: 'Password attuale 123' }, { ip: IP }, response()))).toBe(401);
  });

  it('accepts only JSON from the portal origin', () => {
    const json = { 'content-type': 'application/json' };
    expect(sameOriginProblem({ ...json, origin: 'https://portal.neptive.com' })).toBeNull();
    expect(sameOriginProblem({ ...json, referer: 'https://portal.neptive.com/portal/login' })).toBeNull();
    expect(sameOriginProblem({ ...json, origin: 'https://evil.example' })).toBeTruthy();
    expect(sameOriginProblem({ ...json, origin: 'https://portal.neptive.com.evil.example' })).toBeTruthy();
    expect(sameOriginProblem({ ...json })).toBeTruthy();
    expect(sameOriginProblem({ 'content-type': 'application/x-www-form-urlencoded', origin: 'https://portal.neptive.com' })).toBeTruthy();
    expect(sameOriginProblem({ 'content-type': 'text/plain', origin: 'https://portal.neptive.com' })).toBeTruthy();
  });
});
