import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { NeptiveClientService } from '@gitroom/nestjs-libraries/neptive/services/client.service';
import { NeptivePedService } from '@gitroom/nestjs-libraries/neptive/services/ped.service';
import { NeptiveApprovalService } from '@gitroom/nestjs-libraries/neptive/services/approval.service';
import { NeptiveActivityService } from '@gitroom/nestjs-libraries/neptive/services/activity.service';
import { NeptiveStrategyService } from '@gitroom/nestjs-libraries/neptive/services/strategy.service';
import { NeptiveDeliverableService } from '@gitroom/nestjs-libraries/neptive/services/deliverable.service';
import { NeptiveReportService } from '@gitroom/nestjs-libraries/neptive/services/report.service';
import { NeptiveDashboardService } from '@gitroom/nestjs-libraries/neptive/services/dashboard.service';
import { PostizAdapter } from '@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter';
import {
  CreateNeptiveActivityDto,
  CreateNeptiveApprovalCommentDto,
  CreateNeptiveApprovalDto,
  CreateNeptiveClientDto,
  CreateNeptiveDeliverableDto,
  CreateNeptivePedDto,
  CreateNeptivePedItemDto,
  CreateNeptiveStrategyDto,
  GenerateNeptiveReportDto,
  InviteNeptiveClientUserDto,
  TransitionNeptiveApprovalDto,
  TransitionNeptivePedDto,
  UpdateNeptiveClientDto,
  UpdateNeptivePreviewIdentityDto,
  UpdateNeptivePedDto,
  UpdateNeptiveStrategyDto,
} from '@gitroom/nestjs-libraries/neptive/dto/neptive.dto';
import { NeptiveApprovalStatus } from '@prisma/client';

@Controller('/neptive/agency')
export class NeptiveAgencyController {
  constructor(
    private clients: NeptiveClientService,
    private peds: NeptivePedService,
    private approvals: NeptiveApprovalService,
    private activities: NeptiveActivityService,
    private strategy: NeptiveStrategyService,
    private deliverables: NeptiveDeliverableService,
    private reports: NeptiveReportService,
    private dashboard: NeptiveDashboardService,
    private postiz: PostizAdapter
  ) {}

  @Get('/clients')
  list(@GetOrgFromRequest() org: Organization) {
    return this.clients.list(org.id);
  }

  @Post('/clients')
  create(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateNeptiveClientDto
  ) {
    return this.clients.create(org.id, body);
  }

  @Get('/clients/:customerId')
  get(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string
  ) {
    return this.clients.get(org.id, customerId);
  }

  @Put('/clients/:customerId')
  update(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Body() body: UpdateNeptiveClientDto
  ) {
    return this.clients.update(org.id, customerId, body);
  }

  @Put('/clients/:customerId/preview-identity')
  updatePreviewIdentity(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Body() body: UpdateNeptivePreviewIdentityDto
  ) {
    return this.clients.updatePreviewIdentity(org.id, customerId, body);
  }

  @Delete('/clients/:customerId')
  remove(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string
  ) {
    return this.clients.remove(org.id, customerId);
  }

  @Get('/clients/:customerId/dashboard')
  dashboardView(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string
  ) {
    return this.dashboard.agency(org, customerId);
  }

  @Post('/clients/:customerId/users')
  invite(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Body() body: InviteNeptiveClientUserDto
  ) {
    return this.clients.inviteUser(org.id, customerId, body);
  }

  @Delete('/clients/:customerId/users/:userId')
  removeUser(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Param('userId') userId: string
  ) {
    return this.clients.removeUser(org.id, customerId, userId);
  }

  @Get('/clients/:customerId/posts')
  posts(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Query('state') state?: 'all' | 'scheduled' | 'draft' | 'published'
  ) {
    return this.postiz.postsForCustomer(org.id, customerId, state || 'all');
  }

  @Get('/clients/:customerId/peds')
  pedsList(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string
  ) {
    return this.peds.list(org.id, customerId);
  }

  @Post('/clients/:customerId/peds')
  pedsCreate(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('customerId') customerId: string,
    @Body() body: CreateNeptivePedDto
  ) {
    return this.peds.create(org.id, customerId, user.id, body);
  }

  @Get('/clients/:customerId/peds/:id')
  pedsGet(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Param('id') id: string
  ) {
    return this.peds.getOrForbid(org.id, customerId, id);
  }

  @Put('/clients/:customerId/peds/:id')
  pedsUpdate(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Param('id') id: string,
    @Body() body: UpdateNeptivePedDto
  ) {
    return this.peds.update(org.id, customerId, id, body);
  }

  @Post('/clients/:customerId/peds/:id/transition')
  pedsTransition(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Param('id') id: string,
    @Body() body: TransitionNeptivePedDto
  ) {
    return this.peds.transition(org.id, customerId, id, body);
  }

  @Post('/clients/:customerId/peds/:id/items')
  pedsItem(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Param('id') id: string,
    @Body() body: CreateNeptivePedItemDto
  ) {
    return this.peds.addItem(org.id, customerId, id, body);
  }

  @Delete('/clients/:customerId/peds/:id/items/:itemId')
  pedsItemRemove(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string
  ) {
    return this.peds.removeItem(org.id, customerId, id, itemId);
  }

  @Get('/clients/:customerId/approvals')
  approvalsList(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Query('status') status?: NeptiveApprovalStatus
  ) {
    return this.approvals.list(org.id, customerId, status);
  }

  @Post('/clients/:customerId/approvals')
  approvalsCreate(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('customerId') customerId: string,
    @Body() body: CreateNeptiveApprovalDto
  ) {
    return this.approvals.create(org.id, customerId, user.id, body);
  }

  @Get('/clients/:customerId/approvals/:id')
  approvalsGet(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Param('id') id: string
  ) {
    return this.approvals.getOrForbid(org.id, customerId, id);
  }

  @Post('/clients/:customerId/approvals/:id/transition')
  approvalsTransition(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('customerId') customerId: string,
    @Param('id') id: string,
    @Body() body: TransitionNeptiveApprovalDto
  ) {
    return this.approvals.transition(org.id, customerId, id, body, {
      type: 'AGENCY_USER',
      id: user.id,
      name: user.name || user.email,
    });
  }

  @Post('/clients/:customerId/approvals/:id/comments')
  approvalsComment(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('customerId') customerId: string,
    @Param('id') id: string,
    @Body() body: CreateNeptiveApprovalCommentDto
  ) {
    return this.approvals.comment(org.id, customerId, id, body, {
      type: 'AGENCY_USER',
      id: user.id,
      name: user.name || user.email,
    });
  }

  @Get('/clients/:customerId/strategy')
  strategyList(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string
  ) {
    return this.strategy.list(org.id, customerId, false);
  }

  @Post('/clients/:customerId/strategy')
  strategyCreate(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Body() body: CreateNeptiveStrategyDto
  ) {
    return this.strategy.create(org.id, customerId, body);
  }

  @Put('/clients/:customerId/strategy/:id')
  strategyUpdate(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Param('id') id: string,
    @Body() body: UpdateNeptiveStrategyDto
  ) {
    return this.strategy.update(org.id, customerId, id, body);
  }

  @Delete('/clients/:customerId/strategy/:id')
  strategyRemove(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Param('id') id: string
  ) {
    return this.strategy.remove(org.id, customerId, id);
  }

  @Get('/clients/:customerId/activities')
  activitiesList(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string
  ) {
    return this.activities.list(org.id, customerId, false);
  }

  @Post('/clients/:customerId/activities')
  activitiesCreate(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('customerId') customerId: string,
    @Body() body: CreateNeptiveActivityDto
  ) {
    return this.activities.create(org.id, customerId, user.id, body);
  }

  @Get('/clients/:customerId/materials')
  materialsList(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string
  ) {
    return this.deliverables.list(org.id, customerId, false);
  }

  @Post('/clients/:customerId/materials')
  materialsCreate(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('customerId') customerId: string,
    @Body() body: CreateNeptiveDeliverableDto
  ) {
    return this.deliverables.create(org.id, customerId, user.id, body);
  }

  @Delete('/clients/:customerId/materials/:id')
  materialsRemove(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Param('id') id: string
  ) {
    return this.deliverables.remove(org.id, customerId, id);
  }

  @Get('/clients/:customerId/reports')
  reportsList(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string
  ) {
    return this.reports.list(org.id, customerId, false);
  }

  @Post('/clients/:customerId/reports')
  reportsGenerate(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Body() body: GenerateNeptiveReportDto
  ) {
    return this.reports.generate(org, customerId, body);
  }

  @Get('/clients/:customerId/reports/:id')
  reportsGet(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Param('id') id: string
  ) {
    return this.reports.getOrForbid(org.id, customerId, id);
  }

  @Get('/clients/:customerId/analytics')
  analytics(
    @GetOrgFromRequest() org: Organization,
    @Param('customerId') customerId: string,
    @Query('date') date: string
  ) {
    return this.reports.analytics(org, customerId, date || '30');
  }
}
