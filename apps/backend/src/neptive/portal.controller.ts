import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { Organization } from '@prisma/client';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { NeptivePortalAuthService } from '@gitroom/nestjs-libraries/neptive/services/portal-auth.service';
import { NeptiveDashboardService } from '@gitroom/nestjs-libraries/neptive/services/dashboard.service';
import { NeptivePedService } from '@gitroom/nestjs-libraries/neptive/services/ped.service';
import { NeptiveApprovalService } from '@gitroom/nestjs-libraries/neptive/services/approval.service';
import { NeptiveActivityService } from '@gitroom/nestjs-libraries/neptive/services/activity.service';
import { NeptiveStrategyService } from '@gitroom/nestjs-libraries/neptive/services/strategy.service';
import { NeptiveDeliverableService } from '@gitroom/nestjs-libraries/neptive/services/deliverable.service';
import { NeptiveReportService } from '@gitroom/nestjs-libraries/neptive/services/report.service';
import { PostizAdapter } from '@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter';
import {
  GetNeptivePortal,
} from '@gitroom/nestjs-libraries/neptive/portal.from.request';
import { NeptivePortalIdentity } from '@gitroom/nestjs-libraries/neptive/services/portal-auth.service';
import {
  ConsumeNeptiveMagicLinkDto,
  CreateNeptiveApprovalCommentDto,
  TransitionNeptiveApprovalDto,
  TransitionNeptivePedDto,
} from '@gitroom/nestjs-libraries/neptive/dto/neptive.dto';

@Controller('/neptive/portal-auth')
export class NeptivePortalAuthController {
  constructor(private auth: NeptivePortalAuthService) {}

  @Get('/magic/:token')
  async peek(@Param('token') token: string) {
    const row = await this.auth.peekMagicLink(token);
    if (!row || row.consumedAt || row.expiresAt < new Date()) {
      return { valid: false };
    }
    return {
      valid: true,
      email: row.clientUser.email,
      name: row.clientUser.name,
    };
  }

  @Post('/magic')
  consume(
    @Body() body: ConsumeNeptiveMagicLinkDto,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.auth.consumeMagicLink(body.token, response);
  }

  @Post('/logout')
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const raw =
      (request.cookies?.neptive_portal as string) ||
      (request.headers['neptive-portal'] as string);
    return this.auth.logout(raw, response);
  }
}

@Controller('/neptive/portal')
export class NeptivePortalController {
  constructor(
    private prisma: PrismaService,
    private dashboard: NeptiveDashboardService,
    private peds: NeptivePedService,
    private approvals: NeptiveApprovalService,
    private activities: NeptiveActivityService,
    private strategy: NeptiveStrategyService,
    private deliverables: NeptiveDeliverableService,
    private reports: NeptiveReportService,
    private postiz: PostizAdapter
  ) {}

  private async org(portal: NeptivePortalIdentity): Promise<Organization> {
    return this.prisma.organization.findUniqueOrThrow({
      where: { id: portal.orgId },
    });
  }

  @Get('/me')
  me(@GetNeptivePortal() portal: NeptivePortalIdentity) {
    return {
      name: portal.name,
      email: portal.email,
      role: portal.role,
      customerId: portal.customerId,
    };
  }

  @Get('/dashboard')
  async dashboardView(@GetNeptivePortal() portal: NeptivePortalIdentity) {
    return this.dashboard.portal(await this.org(portal), portal.customerId);
  }

  @Get('/peds')
  pedsList(@GetNeptivePortal() portal: NeptivePortalIdentity) {
    return this.peds.listForPortal(portal.orgId, portal.customerId);
  }

  @Get('/peds/:id')
  pedsGet(
    @GetNeptivePortal() portal: NeptivePortalIdentity,
    @Param('id') id: string
  ) {
    return this.peds.getForPortal(portal.orgId, portal.customerId, id);
  }

  @Post('/peds/:id/transition')
  pedsTransition(
    @GetNeptivePortal() portal: NeptivePortalIdentity,
    @Param('id') id: string,
    @Body() body: TransitionNeptivePedDto
  ) {
    if (!['APPROVED', 'CHANGES_REQUESTED'].includes(body.status)) {
      return this.peds.getOrForbid(portal.orgId, portal.customerId, id);
    }
    return this.peds.transition(
      portal.orgId,
      portal.customerId,
      id,
      body,
      portal.clientUserId
    );
  }

  @Get('/approvals')
  async approvalsList(@GetNeptivePortal() portal: NeptivePortalIdentity) {
    const rows = await this.approvals.list(
      portal.orgId,
      portal.customerId,
      'PENDING_CLIENT_APPROVAL'
    );
    return rows.map((row) => this.approvals.visibleForClient(row));
  }

  @Get('/approvals/:id')
  async approvalsGet(
    @GetNeptivePortal() portal: NeptivePortalIdentity,
    @Param('id') id: string
  ) {
    const row = await this.approvals.getOrForbid(
      portal.orgId,
      portal.customerId,
      id
    );
    return this.approvals.visibleForClient(row);
  }

  @Post('/approvals/:id/transition')
  approvalsTransition(
    @GetNeptivePortal() portal: NeptivePortalIdentity,
    @Param('id') id: string,
    @Body() body: TransitionNeptiveApprovalDto
  ) {
    return this.approvals.transition(
      portal.orgId,
      portal.customerId,
      id,
      body,
      {
        type: 'CLIENT_USER',
        id: portal.clientUserId,
        name: portal.name,
      }
    );
  }

  @Post('/approvals/:id/comments')
  approvalsComment(
    @GetNeptivePortal() portal: NeptivePortalIdentity,
    @Param('id') id: string,
    @Body() body: CreateNeptiveApprovalCommentDto
  ) {
    return this.approvals.comment(portal.orgId, portal.customerId, id, body, {
      type: 'CLIENT_USER',
      id: portal.clientUserId,
      name: portal.name,
    });
  }

  @Get('/content')
  content(
    @GetNeptivePortal() portal: NeptivePortalIdentity,
    @Query('state') state?: 'all' | 'scheduled' | 'draft' | 'published'
  ) {
    return this.postiz.postsForCustomer(
      portal.orgId,
      portal.customerId,
      state || 'scheduled'
    );
  }

  @Get('/strategy')
  strategyList(@GetNeptivePortal() portal: NeptivePortalIdentity) {
    return this.strategy.list(portal.orgId, portal.customerId, true);
  }

  @Get('/activities')
  activitiesList(@GetNeptivePortal() portal: NeptivePortalIdentity) {
    return this.activities.list(portal.orgId, portal.customerId, true);
  }

  @Get('/materials')
  materialsList(@GetNeptivePortal() portal: NeptivePortalIdentity) {
    return this.deliverables.list(portal.orgId, portal.customerId, true);
  }

  @Get('/reports')
  reportsList(@GetNeptivePortal() portal: NeptivePortalIdentity) {
    return this.reports.list(portal.orgId, portal.customerId, true);
  }

  @Get('/reports/:id')
  reportsGet(
    @GetNeptivePortal() portal: NeptivePortalIdentity,
    @Param('id') id: string
  ) {
    return this.reports.getOrForbid(portal.orgId, portal.customerId, id);
  }

  @Get('/analytics')
  async analytics(
    @GetNeptivePortal() portal: NeptivePortalIdentity,
    @Query('date') date: string
  ) {
    return this.reports.analytics(
      await this.org(portal),
      portal.customerId,
      date || '30'
    );
  }
}
