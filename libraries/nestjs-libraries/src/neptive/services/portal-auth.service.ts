import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
import { NeptiveRepository } from '@gitroom/nestjs-libraries/neptive/repositories/neptive.repository';
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
};

@Injectable()
export class NeptivePortalAuthService {
  constructor(private repo: NeptiveRepository) {}

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
      !row.clientUser.activated
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
      session.clientUser.deletedAt
    ) {
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
