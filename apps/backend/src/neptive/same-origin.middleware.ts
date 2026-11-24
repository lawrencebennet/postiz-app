import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { portalRequestProblem } from '@gitroom/nestjs-libraries/neptive/auth/request-guards';

// CSRF for the whole portal: every non-GET request to a portal controller must come as JSON from
// FRONTEND_URL. The portal cookie is SameSite=None in production, so without this a form on another
// site could approve content (and so schedule publication) with a client's session.
// Bound to every portal controller in neptive.api.module.ts; portal-routes-csrf.spec.ts fails if a portal
// controller is added without it.
@Injectable()
export class NeptiveSameOriginMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const problem = portalRequestProblem(req.method, req.headers || {});
    if (problem) {
      throw new ForbiddenException(problem);
    }
    next();
  }
}
