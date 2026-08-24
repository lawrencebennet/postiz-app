import { Module } from '@nestjs/common';
import { NeptiveRepository } from '@gitroom/nestjs-libraries/neptive/repositories/neptive.repository';
import { PostizAdapter } from '@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter';
import { NeptiveClientService } from '@gitroom/nestjs-libraries/neptive/services/client.service';
import { NeptivePortalAuthService } from '@gitroom/nestjs-libraries/neptive/services/portal-auth.service';
import { NeptivePedService } from '@gitroom/nestjs-libraries/neptive/services/ped.service';
import { NeptiveApprovalService } from '@gitroom/nestjs-libraries/neptive/services/approval.service';
import { NeptiveActivityService } from '@gitroom/nestjs-libraries/neptive/services/activity.service';
import { NeptiveStrategyService } from '@gitroom/nestjs-libraries/neptive/services/strategy.service';
import { NeptiveDeliverableService } from '@gitroom/nestjs-libraries/neptive/services/deliverable.service';
import { NeptiveReportService } from '@gitroom/nestjs-libraries/neptive/services/report.service';
import { NeptiveDashboardService } from '@gitroom/nestjs-libraries/neptive/services/dashboard.service';

const providers = [
  NeptiveRepository,
  PostizAdapter,
  NeptiveClientService,
  NeptivePortalAuthService,
  NeptivePedService,
  NeptiveApprovalService,
  NeptiveActivityService,
  NeptiveStrategyService,
  NeptiveDeliverableService,
  NeptiveReportService,
  NeptiveDashboardService,
];

@Module({
  providers,
  exports: providers,
})
export class NeptiveModule {}
