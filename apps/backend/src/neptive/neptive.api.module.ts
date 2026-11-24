import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NeptiveModule } from '@gitroom/nestjs-libraries/neptive/neptive.module';
import { NeptiveAgencyController } from '@gitroom/backend/neptive/agency.controller';
import {
  NeptivePortalAccountController,
  NeptivePortalAuthController,
  NeptivePortalController,
} from '@gitroom/backend/neptive/portal.controller';
import { NeptivePortalMiddleware } from '@gitroom/backend/neptive/portal.middleware';
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
    AuthMiddleware,
    // white-label: upstream error messages carry the Neptive name (see brand-errors.interceptor.ts)
    { provide: APP_INTERCEPTOR, useClass: NeptiveBrandErrorsInterceptor },
  ],
})
export class NeptiveApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes(NeptiveAgencyController);
    consumer
      .apply(NeptivePortalMiddleware)
      .forRoutes(NeptivePortalController, NeptivePortalAccountController);
  }
}
