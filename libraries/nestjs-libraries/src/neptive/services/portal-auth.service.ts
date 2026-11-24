import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
import { NeptiveRepository } from '@gitroom/nestjs-libraries/neptive/repositories/neptive.repository';
import { NeptiveCredentialRepository } from '@gitroom/nestjs-libraries/neptive/repositories/credential.repository';
import {
  hashNeptiveToken,
  newNeptiveToken,
} from '@gitroom/nestjs-libraries/neptive/domain/tokens';

export type NeptivePortalIdentity = {
  sessionId: string;
  clientUserId: string;
  customerId: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
  // session opened with a temporary password: only /me and the password change answer
  passwordChangeRequired: boolean;
};

export const NEPTIVE_DEVICE_COOKIE = 'neptive_portal_device';
const DEVICE_TTL_MS = 1000 * 60 * 60 * 24 * 180;

@Injectable()
export class NeptivePortalAuthService {
  constructor(
    private repo: NeptiveRepository,
    private credentials: NeptiveCredentialRepository
  ) {}

  cookieOptions() {
    return {
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
      ...(!process.env.NOT_SECURED
        ? {
            secure: true,
            httpOnly: true,
            sameSite: 'none' as const,
          }
        : {}),
    };
  }

  setSessionCookie(response: Response, jwt: string) {
    response.cookie('neptive_portal', jwt, {
      ...this.cookieOptions(),
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    });
    if (process.env.NOT_SECURED) {
      response.header('neptive-portal', jwt);
    }
  }

  clearSessionCookie(response: Response) {
    response.cookie('neptive_portal', '', {
      ...this.cookieOptions(),
      expires: new Date(0),
      maxAge: -1,
    });
  }

  /**
   * Opens a portal session for a password login: same row, same JWT, same cookie as a magic link
   * session (consumeMagicLink), plus the passwordChangeRequired flag.
   */
  async openPasswordSession(
    user: { id: string; customerId: string; orgId: string },
    response: Response,
    options: { passwordChangeRequired: boolean; ttlMs: number }
  ) {
    const sessionToken = newNeptiveToken();
    const session = await this.credentials.createSession({
      tokenHash: hashNeptiveToken(sessionToken),
      clientUserId: user.id,
      customerId: user.customerId,
      orgId: user.orgId,
      expiresAt: new Date(Date.now() + options.ttlMs),
      passwordChangeRequired: options.passwordChangeRequired,
    });
    this.issueSession(user, session.id, sessionToken, response);
    await this.repo.touchClientLogin(user.id);
    return session;
  }

  /** a fresh random session token and its hash, for callers that create the session row themselves */
  newSessionToken() {
    const sessionToken = newNeptiveToken();
    return { sessionToken, tokenHash: hashNeptiveToken(sessionToken) };
  }

  /** the JWT + cookie of an existing session row (same shape as a magic-link session) */
  issueSession(
    user: { id: string; customerId: string; orgId: string },
    sessionId: string,
    sessionToken: string,
    response: Response
  ) {
    const jwt = AuthService.signJWT({
      neptive: true,
      sessionId,
      sessionToken,
      clientUserId: user.id,
      customerId: user.customerId,
      orgId: user.orgId,
    });
    this.setSessionCookie(response, jwt);
  }

  /** "recognised device" cookie: lets this browser keep logging in while the account is throttled */
  setDeviceCookie(response: Response, deviceId: string, emailFingerprint: string) {
    const jwt = AuthService.signJWT({
      neptiveDevice: true,
      d: deviceId,
      e: emailFingerprint,
      exp: Math.floor((Date.now() + DEVICE_TTL_MS) / 1000),
    });
    response.cookie(NEPTIVE_DEVICE_COOKIE, jwt, {
      ...this.cookieOptions(),
      expires: new Date(Date.now() + DEVICE_TTL_MS),
    });
  }

  /** device id when the cookie is genuine and was issued for this email, else null */
  readDevice(raw: string | undefined, emailFingerprint: string): string | null {
    if (!raw) {
      return null;
    }
    try {
      const payload = AuthService.verifyJWT(raw) as {
        neptiveDevice?: boolean;
        d?: string;
        e?: string;
      };
      return payload?.neptiveDevice &&
        typeof payload.d === 'string' &&
        payload.e === emailFingerprint
        ? payload.d
        : null;
    } catch {
      return null;
    }
  }

  private async liveTenant(orgId: string, customerId: string) {
    const [customer, organization] = await Promise.all([
      this.repo.customerInOrg(orgId, customerId),
      this.repo.liveOrganization(orgId),
    ]);
    return !!customer && !!organization;
  }

  peekMagicLink(token: string) {
    return this.repo.magicLinkByHash(hashNeptiveToken(token));
  }

  async consumeMagicLink(token: string, response: Response) {
    const row = await this.repo.magicLinkByHash(hashNeptiveToken(token));
    if (
      !row ||
      row.consumedAt ||
      row.expiresAt < new Date() ||
      row.clientUser.deletedAt ||
      !row.clientUser.activated ||
      row.clientUser.customerId !== row.customerId ||
      row.clientUser.orgId !== row.orgId ||
      !(await this.liveTenant(row.orgId, row.customerId))
    ) {
      throw new UnauthorizedException('Invalid or expired link');
    }
    const consumed = await this.repo.consumeMagicLink(row.id);
    if (!consumed.count) {
      throw new UnauthorizedException('Invalid or expired link');
    }
    const sessionToken = newNeptiveToken();
    const session = await this.repo.createSession({
      tokenHash: hashNeptiveToken(sessionToken),
      clientUserId: row.clientUserId,
      customerId: row.customerId,
      orgId: row.orgId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    });
    await this.repo.touchClientLogin(row.clientUserId);
    const jwt = AuthService.signJWT({
      neptive: true,
      sessionId: session.id,
      sessionToken,
      clientUserId: row.clientUserId,
      customerId: row.customerId,
      orgId: row.orgId,
    });
    this.setSessionCookie(response, jwt);
    return {
      customerId: row.customerId,
      name: row.clientUser.name,
      email: row.clientUser.email,
    };
  }

  async resolve(raw: string | undefined): Promise<NeptivePortalIdentity> {
    if (!raw) {
      throw new UnauthorizedException();
    }
    let payload: {
      neptive?: boolean;
      sessionId?: string;
      sessionToken?: string;
      clientUserId?: string;
      customerId?: string;
      orgId?: string;
    };
    try {
      payload = AuthService.verifyJWT(raw) as typeof payload;
    } catch {
      throw new UnauthorizedException();
    }
    if (!payload?.neptive || !payload.sessionToken) {
      throw new UnauthorizedException();
    }
    const session = await this.repo.sessionByHash(
      hashNeptiveToken(payload.sessionToken)
    );
    if (
      !session ||
      session.id !== payload.sessionId ||
      session.clientUserId !== payload.clientUserId ||
      session.customerId !== payload.customerId ||
      session.orgId !== payload.orgId ||
      session.clientUser.deletedAt ||
      !session.clientUser.activated ||
      // the user row must still belong to the customer and organization the session was opened for
      session.clientUser.customerId !== session.customerId ||
      session.clientUser.orgId !== session.orgId
    ) {
      throw new UnauthorizedException();
    }
    // the customer (not soft-deleted, same organization) and the organization must still be live: every
    // portal route takes the customer from here, so a removed client loses access everywhere at once
    if (!(await this.liveTenant(session.orgId, session.customerId))) {
      throw new UnauthorizedException();
    }
    return {
      sessionId: session.id,
      clientUserId: session.clientUserId,
      customerId: session.customerId,
      orgId: session.orgId,
      email: session.clientUser.email,
      name: session.clientUser.name,
      role: session.clientUser.role,
      passwordChangeRequired: !!session.passwordChangeRequired,
    };
  }

  async logout(raw: string | undefined, response: Response) {
    this.clearSessionCookie(response);
    if (!raw) {
      return { ok: true };
    }
    try {
      const identity = await this.resolve(raw);
      await this.repo.revokeSession(identity.sessionId);
    } catch {
      return { ok: true };
    }
    return { ok: true };
  }
}
