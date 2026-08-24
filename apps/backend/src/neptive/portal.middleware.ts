import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { NeptivePortalAuthService } from '@gitroom/nestjs-libraries/neptive/services/portal-auth.service';

@Injectable()
export class NeptivePortalMiddleware implements NestMiddleware {
  constructor(private auth: NeptivePortalAuthService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const raw =
      (req.cookies?.neptive_portal as string) ||
      (req.headers['neptive-portal'] as string);
    const identity = await this.auth.resolve(raw);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error portal identity is not on the Express type
    req.neptivePortal = identity;
    next();
  }
}
