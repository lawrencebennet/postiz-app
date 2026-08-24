import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NeptiveModule } from '@gitroom/nestjs-libraries/neptive/neptive.module';
import { NeptiveAgencyController } from '@gitroom/backend/neptive/agency.controller';
import {
  NeptivePortalAuthController,
  NeptivePortalController,
} from '@gitroom/backend/neptive/portal.controller';
import { NeptivePortalMiddleware } from '@gitroom/backend/neptive/portal.middleware';
import { AuthMiddleware } from '@gitroom/backend/services/auth/auth.middleware';

@Module({
  imports: [NeptiveModule],
  controllers: [
    NeptiveAgencyController,
    NeptivePortalAuthController,
    NeptivePortalController,
  ],
  providers: [NeptivePortalMiddleware, AuthMiddleware],
})
export class NeptiveApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes(NeptiveAgencyController);
    consumer.apply(NeptivePortalMiddleware).forRoutes(NeptivePortalController);
  }
}
