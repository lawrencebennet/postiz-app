import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, Observable, throwError } from 'rxjs';
import { brandText } from '@gitroom/nestjs-libraries/neptive/brand/brand';

/**
 * Global (APP_INTERCEPTOR, registered by NeptiveApiModule): upstream error messages shown to people
 * ("No Postiz account found for this email" on forgot password, plan limits...) get the Neptive name.
 * Only HttpException messages, mutated in place: the exception keeps its class (HttpForbiddenException
 * clears the auth cookie by class), its status and every other field. Response bodies with user data are
 * never touched.
 */
@Injectable()
export class NeptiveBrandErrorsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err) => {
        if (err instanceof HttpException) {
          const response = err.getResponse() as unknown;
          if (typeof response === 'string' && /postiz|gitroom/i.test(response)) {
            (err as any).response = brandText(response);
            err.message = brandText(err.message);
          } else if (response && typeof response === 'object') {
            const body = response as { message?: unknown };
            if (typeof body.message === 'string' && /postiz|gitroom/i.test(body.message)) {
              body.message = brandText(body.message);
              err.message = brandText(err.message);
            } else if (Array.isArray(body.message)) {
              body.message = body.message.map((m) => (typeof m === 'string' ? brandText(m) : m));
            }
          }
        }
        return throwError(() => err);
      })
    );
  }
}
