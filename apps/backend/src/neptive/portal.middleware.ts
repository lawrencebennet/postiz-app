import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { NeptivePortalAuthService } from '@gitroom/nestjs-libraries/neptive/services/portal-auth.service';
import {
  PASSWORD_CHANGE_REQUIRED,
  allowedDuringPasswordChange,
} from '@gitroom/nestjs-libraries/neptive/auth/request-guards';

@Injectable()
export class NeptivePortalMiddleware implements NestMiddleware {
  constructor(private auth: NeptivePortalAuthService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const raw =
      (req.cookies?.neptive_portal as string) ||
      (req.headers['neptive-portal'] as string);
    const identity = await this.auth.resolve(raw);
    // temporary-password session: nothing but /me and the password change until it is changed
    if (
      identity.passwordChangeRequired &&
      !allowedDuringPasswordChange(req.method, req.originalUrl)
    ) {
      throw new ForbiddenException(PASSWORD_CHANGE_REQUIRED);
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error portal identity is not on the Express type
    req.neptivePortal = identity;
    next();
  }
}
