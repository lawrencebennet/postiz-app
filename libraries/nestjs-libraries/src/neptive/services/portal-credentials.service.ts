import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { compare, hash } from 'bcrypt';
import { randomBytes } from 'crypto';
import { NeptiveActivityType } from '@prisma/client';
import { NeptiveRepository } from '@gitroom/nestjs-libraries/neptive/repositories/neptive.repository';
import { NeptiveCredentialRepository } from '@gitroom/nestjs-libraries/neptive/repositories/credential.repository';
import {
  NeptivePortalAuthService,
  NeptivePortalIdentity,
} from '@gitroom/nestjs-libraries/neptive/services/portal-auth.service';
import {
  emailFingerprint,
  newTemporaryPassword,
  normalizeLoginEmail,
  passwordProblem,
  throttleBucket,
} from '@gitroom/nestjs-libraries/neptive/domain/credentials';

// Numbers (documented in neptive/docs/client-credentials.md):
export const NEPTIVE_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const NEPTIVE_LOGIN_LIMITS = {
  // failures per account (email) from browsers not recognised for that email
  email: 5,
  // failures per client IP from browsers not recognised for the email tried
  ip: 20,
  // failures per recognised browser (it skips the two buckets above)
  device: 10,
  // wrong "current password" on the account page, per client user
  change: 5,
} as const;
// bcrypt comparisons per login attempt, whatever the email: an unknown email, a user without a
// password and a user with one cost the same (two compares), so the timing does not tell them apart.
export const NEPTIVE_LOGIN_MIN_COMPARES = 2;
const BCRYPT_ROUNDS = 10; // same cost as the admin login (AuthService.hashPassword)
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // same as a magic-link session
const RESTRICTED_SESSION_TTL_MS = 1000 * 60 * 30; // session opened with a temporary password

export const INVALID_CREDENTIALS = 'Invalid credentials';

type Bucket = { scope: keyof typeof NEPTIVE_LOGIN_LIMITS; id: string; limit: number };

export class NeptiveThrottledException extends HttpException {
  constructor(retryAfterSeconds: number) {
    super({ message: 'Too many attempts', retryAfter: retryAfterSeconds }, 429);
  }
}

let dummyHash: Promise<string> | null = null;
const dummy = () => (dummyHash ||= hash(randomBytes(16).toString('hex'), BCRYPT_ROUNDS));

@Injectable()
export class NeptivePortalCredentialsService {
  private readonly logger = new Logger('NeptivePortalCredentials');
  // attempts being verified right now, per bucket: counted with the stored failures so a burst of
  // parallel requests cannot run more guesses than the limit
  private inFlight = new Map<string, number>();

  constructor(
    private repo: NeptiveRepository,
    private credentials: NeptiveCredentialRepository,
    private auth: NeptivePortalAuthService
  ) {}

  // ---------------------------------------------------------------- throttling

  /** seconds to wait (0 = go ahead); call it after enter(): the caller's own attempt is not counted */
  private async retryAfter(buckets: Bucket[]) {
    const since = new Date(Date.now() - NEPTIVE_LOGIN_WINDOW_MS);
    let wait = 0;
    for (const bucket of buckets) {
      const { count, oldest } = await this.credentials.failures(bucket.id, since);
      const others = (this.inFlight.get(bucket.id) || 1) - 1;
      if (count + others >= bucket.limit) {
        const until = (oldest?.getTime() || Date.now()) + NEPTIVE_LOGIN_WINDOW_MS;
        wait = Math.max(wait, Math.ceil((until - Date.now()) / 1000), 1);
      }
    }
    return wait;
  }

  private enter(buckets: Bucket[]) {
    for (const bucket of buckets) {
      this.inFlight.set(bucket.id, (this.inFlight.get(bucket.id) || 0) + 1);
    }
  }

  private leave(buckets: Bucket[]) {
    for (const bucket of buckets) {
      const next = (this.inFlight.get(bucket.id) || 1) - 1;
      if (next > 0) this.inFlight.set(bucket.id, next);
      else this.inFlight.delete(bucket.id);
    }
  }

  /** stores the failure; returns the buckets this failure just closed */
  private async fail(buckets: Bucket[]) {
    await this.credentials.addFailures(buckets.map((bucket) => bucket.id));
    const since = new Date(Date.now() - NEPTIVE_LOGIN_WINDOW_MS);
    const closed: Bucket[] = [];
    for (const bucket of buckets) {
      const { count } = await this.credentials.failures(bucket.id, since);
      if (count === bucket.limit) {
        closed.push(bucket);
      }
    }
    return closed;
  }

  private recordThrottled(email: string, closed: Bucket[]) {
    if (!closed.length) {
      return;
    }
    this.logger.warn(
      `portal password login throttled (${closed.map((bucket) => bucket.scope).join(', ')})`
    );
    // after the response on purpose: whether users exist for this email must not change its timing
    setImmediate(() => {
      this.throttledActivities(email, closed).catch(() => undefined);
    });
  }

  private async throttledActivities(email: string, closed: Bucket[]) {
    if (!email) {
      return;
    }
    const why = closed
      .map((bucket) =>
        bucket.scope === 'email'
          ? `${bucket.limit} password errate in 15 minuti per questo account`
          : bucket.scope === 'ip'
          ? `${bucket.limit} password errate in 15 minuti dalla stessa rete`
          : `${bucket.limit} password errate in 15 minuti dallo stesso browser`
      )
      .join('; ');
    for (const user of await this.credentials.liveUsersByEmail(email)) {
      await this.activity(
        user.orgId,
        user.customerId,
        'CLIENT_LOGIN_THROTTLED',
        `Accesso con password sospeso per 15 minuti: ${user.name}`,
        `${why}. Gli accessi con link restano possibili; dai browser già usati dal cliente l’accesso con password continua a funzionare.`
      );
    }
  }

  private activity(
    orgId: string,
    customerId: string,
    type: NeptiveActivityType,
    title: string,
    body?: string,
    performedByUserId?: string
  ) {
    // agency-only log: the client never sees these, and they never contain a password or a hash
    return this.repo.createActivity({
      orgId,
      customerId,
      type,
      title,
      body,
      visibility: 'INTERNAL',
      source: 'SYSTEM',
      performedByUserId,
    });
  }

  // ---------------------------------------------------------------- login

  async login(
    input: { email?: unknown; password?: unknown; account?: unknown },
    context: { ip: string; deviceCookie?: string },
    response: Response
  ) {
    const email = normalizeLoginEmail(input.email);
    const password = typeof input.password === 'string' ? input.password : '';
    const account = typeof input.account === 'string' ? input.account : undefined;
    const fingerprint = emailFingerprint(email);
    const device = email ? this.auth.readDevice(context.deviceCookie, fingerprint) : null;
    const buckets: Bucket[] = device
      ? [{ scope: 'device', id: throttleBucket('device', device), limit: NEPTIVE_LOGIN_LIMITS.device }]
      : [
          { scope: 'email', id: throttleBucket('email', email), limit: NEPTIVE_LOGIN_LIMITS.email },
          { scope: 'ip', id: throttleBucket('ip', context.ip), limit: NEPTIVE_LOGIN_LIMITS.ip },
        ];

    this.enter(buckets);
    try {
      const wait = await this.retryAfter(buckets);
      if (wait) {
        response.setHeader('Retry-After', String(wait));
        throw new NeptiveThrottledException(wait);
      }
      const candidates = email ? await this.credentials.loginCandidates(email) : [];
      const pool = account ? candidates.filter((row) => row.id === account) : candidates;
      const matches: typeof pool = [];
      for (const row of pool) {
        if (await compare(password, row.passwordHash)) {
          matches.push(row);
        }
      }
      for (let i = pool.length; i < NEPTIVE_LOGIN_MIN_COMPARES; i++) {
        await compare(password, await dummy());
      }

      if (!matches.length) {
        this.recordThrottled(email, await this.fail(buckets));
        throw new UnauthorizedException(INVALID_CREDENTIALS);
      }

      if (matches.length > 1) {
        // the same email with the same password under several customers: the person proved both,
        // so they choose; nobody else ever sees this list
        return {
          chooseAccount: matches.map((row) => ({
            account: row.id,
            label: row.customerName,
          })),
        };
      }

      const user = matches[0];
      await this.auth.openPasswordSession(user, response, {
        passwordChangeRequired: user.mustChange,
        ttlMs: user.mustChange ? RESTRICTED_SESSION_TTL_MS : SESSION_TTL_MS,
      });
      this.auth.setDeviceCookie(response, device || randomBytes(16).toString('hex'), fingerprint);
      return { ok: true, passwordChangeRequired: user.mustChange };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // never let an unexpected error carry the request (and its password) to an error reporter
      this.logger.error('portal password login failed unexpectedly');
      throw new HttpException('Login unavailable', 503);
    } finally {
      this.leave(buckets);
    }
  }

  // ---------------------------------------------------------------- client: own password

  async status(clientUserId: string) {
    const summary = await this.credentials.credentialSummary(clientUserId);
    return {
      hasPassword: !!summary,
      passwordTemporary: !!summary?.mustChange,
      passwordUpdatedAt: summary?.updatedAt || null,
    };
  }

  async changeOwnPassword(
    identity: NeptivePortalIdentity,
    input: { currentPassword?: unknown; newPassword?: unknown },
    response: Response
  ) {
    try {
      const user = await this.repo.clientUserById(
        identity.orgId,
        identity.customerId,
        identity.clientUserId
      );
      if (!user || !user.activated) {
        throw new UnauthorizedException();
      }
      const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
      const problem = passwordProblem(newPassword, user.email);
      if (problem) {
        throw new BadRequestException(problem);
      }
      const existing = await this.credentials.credentialForUser(user.id);
      // a session opened with the temporary password just proved it; every other change of an
      // existing password needs the current one
      if (existing && !identity.passwordChangeRequired) {
        const buckets: Bucket[] = [
          { scope: 'change', id: throttleBucket('change', user.id), limit: NEPTIVE_LOGIN_LIMITS.change },
        ];
        this.enter(buckets);
        try {
          const wait = await this.retryAfter(buckets);
          if (wait) {
            response.setHeader('Retry-After', String(wait));
            throw new NeptiveThrottledException(wait);
          }
          const current = typeof input.currentPassword === 'string' ? input.currentPassword : '';
          if (!(await compare(current, existing.passwordHash))) {
            await this.fail(buckets);
            throw new BadRequestException('CURRENT_PASSWORD_WRONG');
          }
        } finally {
          this.leave(buckets);
        }
      }
      if (existing && (await compare(newPassword, existing.passwordHash))) {
        throw new BadRequestException('PASSWORD_SAME_AS_CURRENT');
      }

      await this.credentials.saveCredential({
        clientUserId: user.id,
        orgId: user.orgId,
        customerId: user.customerId,
        passwordHash: await hash(newPassword, BCRYPT_ROUNDS),
        source: 'CLIENT',
        mustChange: false,
        setByUserId: null,
      });
      // every session of this user ends (other devices included); this browser gets a fresh one
      await this.credentials.revokeUserSessions(user.id);
      await this.auth.openPasswordSession(user, response, {
        passwordChangeRequired: false,
        ttlMs: SESSION_TTL_MS,
      });
      this.auth.setDeviceCookie(response, randomBytes(16).toString('hex'), emailFingerprint(user.email));

      if (!existing) {
        await this.activity(user.orgId, user.customerId, 'CLIENT_PASSWORD_SET', `${user.name} ha impostato una password per il portale`);
      } else {
        await this.activity(
          user.orgId,
          user.customerId,
          'CLIENT_PASSWORD_CHANGED',
          existing.mustChange
            ? `${user.name} ha sostituito la password temporanea con una sua`
            : `${user.name} ha cambiato la password del portale`,
          'Le altre sessioni aperte di questo utente sono state chiuse.'
        );
      }
      return { ok: true };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('portal password change failed unexpectedly');
      throw new HttpException('Password change unavailable', 503);
    }
  }

  // ---------------------------------------------------------------- agency

  private async agencyUser(orgId: string, customerId: string, userId: string) {
    const customer = await this.repo.customerInOrg(orgId, customerId);
    const user = customer ? await this.repo.clientUserById(orgId, customerId, userId) : null;
    if (!user) {
      throw new NotFoundException();
    }
    return user;
  }

  /** generates, stores (hash) and returns once a temporary password; ends the user's sessions */
  async issueTemporaryPassword(
    orgId: string,
    customerId: string,
    userId: string,
    agencyUserId?: string
  ) {
    const user = await this.agencyUser(orgId, customerId, userId);
    const password = newTemporaryPassword();
    const summary = await this.credentials.saveCredential({
      clientUserId: user.id,
      orgId,
      customerId,
      passwordHash: await hash(password, BCRYPT_ROUNDS),
      source: 'AGENCY',
      mustChange: true,
      setByUserId: agencyUserId || null,
    });
    await this.credentials.revokeUserSessions(user.id);
    await this.activity(
      orgId,
      customerId,
      'CLIENT_PASSWORD_RESET',
      `Password temporanea generata per ${user.name}`,
      'Al prossimo accesso con password il cliente deve sceglierne una sua. Le sessioni aperte di questo utente sono state chiuse.',
      agencyUserId
    );
    return {
      password,
      user: {
        id: user.id,
        hasPassword: true,
        passwordTemporary: summary.mustChange,
        passwordUpdatedAt: summary.updatedAt,
      },
    };
  }

  async removePassword(
    orgId: string,
    customerId: string,
    userId: string,
    agencyUserId?: string
  ) {
    const user = await this.agencyUser(orgId, customerId, userId);
    const removed = await this.credentials.deleteCredential(user.id);
    if (removed.count) {
      await this.credentials.revokeUserSessions(user.id);
      await this.activity(
        orgId,
        customerId,
        'CLIENT_PASSWORD_REMOVED',
        `Password rimossa per ${user.name}`,
        'L’accesso con password non funziona più; i link di accesso sì. Le sessioni aperte di questo utente sono state chiuse.',
        agencyUserId
      );
    }
    return { ok: true, removed: removed.count > 0 };
  }

  /** agency list projection: password state only, never the hash */
  async summaries(orgId: string, customerId: string) {
    const rows = await this.credentials.credentialSummaries(orgId, customerId);
    return new Map(rows.map((row) => [row.clientUserId, row]));
  }
}
