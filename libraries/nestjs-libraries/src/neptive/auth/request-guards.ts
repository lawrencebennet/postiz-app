import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * CSRF check for the credential endpoints (login, password change, agency password actions).
 *
 * The portal cookie is SameSite=None in production, so the browser attaches it to cross-site requests,
 * and Nest parses urlencoded bodies: a plain HTML form on another site could otherwise POST here with
 * the victim's session. These endpoints therefore accept only JSON (a cross-site JSON POST needs a CORS
 * preflight, which only FRONTEND_URL passes) and only from the FRONTEND_URL origin (Origin header, or
 * Referer when a browser omits Origin). Non-browser clients must send a matching Origin.
 */
export function sameOriginProblem(
  headers: Record<string, string | string[] | undefined>,
  frontendUrl = process.env.FRONTEND_URL
): string | null {
  let allowed: string;
  try {
    allowed = new URL(frontendUrl || '').origin;
  } catch {
    return 'FRONTEND_URL is not set';
  }
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const contentType = (one(headers['content-type']) || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return 'JSON body required';
  }
  const origin = one(headers['origin']);
  if (origin) {
    return origin === allowed ? null : 'Cross-site request refused';
  }
  const referer = one(headers['referer']);
  if (!referer) {
    return 'Origin required';
  }
  try {
    return new URL(referer).origin === allowed ? null : 'Cross-site request refused';
  } catch {
    return 'Cross-site request refused';
  }
}

@Injectable()
export class NeptiveSameOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const problem = sameOriginProblem(request.headers || {});
    if (problem) {
      throw new ForbiddenException(problem);
    }
    return true;
  }
}

/**
 * A session opened with a temporary password may only read /me and change the password (deny by
 * default: any other portal route, present or future, answers 403). Checked in the portal middleware,
 * before any portal handler runs. Paths are those the backend sees (nginx strips /api).
 */
const ALLOWED_DURING_PASSWORD_CHANGE = new Set([
  'GET /neptive/portal/me',
  'POST /neptive/portal/account/password',
]);

export function allowedDuringPasswordChange(method: string, originalUrl: string) {
  const path = (originalUrl || '').split('?')[0];
  return ALLOWED_DURING_PASSWORD_CHANGE.has(`${(method || '').toUpperCase()} ${path}`);
}

export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';
