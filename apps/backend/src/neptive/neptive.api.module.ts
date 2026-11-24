import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NeptiveModule } from '@gitroom/nestjs-libraries/neptive/neptive.module';
import { NeptiveAgencyController } from '@gitroom/backend/neptive/agency.controller';
import {
  NeptivePortalAccountController,
  NeptivePortalAuthController,
  NeptivePortalController,
} from '@gitroom/backend/neptive/portal.controller';
import { NeptivePortalMiddleware } from '@gitroom/backend/neptive/portal.middleware';
import { NeptiveSameOriginMiddleware } from '@gitroom/backend/neptive/same-origin.middleware';
import { AuthMiddleware } from '@gitroom/backend/services/auth/auth.middleware';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { NeptiveBrandErrorsInterceptor } from '@gitroom/backend/neptive/brand-errors.interceptor';

@Module({
  imports: [NeptiveModule],
  controllers: [
    NeptiveAgencyController,
    NeptivePortalAuthController,
    NeptivePortalController,
    NeptivePortalAccountController,
  ],
  providers: [
    NeptivePortalMiddleware,
    NeptiveSameOriginMiddleware,
    AuthMiddleware,
    // white-label: upstream error messages carry the Neptive name (see brand-errors.interceptor.ts)
    { provide: APP_INTERCEPTOR, useClass: NeptiveBrandErrorsInterceptor },
  ],
})
export class NeptiveApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes(NeptiveAgencyController);
    // CSRF first, for every portal controller (public auth routes included); keep this list complete:
    // portal-routes-csrf.spec.ts compares it with the portal controllers
    consumer
      .apply(NeptiveSameOriginMiddleware)
      .forRoutes(
        NeptivePortalAuthController,
        NeptivePortalController,
        NeptivePortalAccountController
      );
    consumer
      .apply(NeptivePortalMiddleware)
      .forRoutes(NeptivePortalController, NeptivePortalAccountController);
  }
}
