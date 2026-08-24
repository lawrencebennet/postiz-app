import { Injectable } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { NeptivePedService } from '@gitroom/nestjs-libraries/neptive/services/ped.service';
import { NeptiveApprovalService } from '@gitroom/nestjs-libraries/neptive/services/approval.service';
import { NeptiveActivityService } from '@gitroom/nestjs-libraries/neptive/services/activity.service';
import { NeptiveStrategyService } from '@gitroom/nestjs-libraries/neptive/services/strategy.service';
import { NeptiveDeliverableService } from '@gitroom/nestjs-libraries/neptive/services/deliverable.service';
import { NeptiveReportService } from '@gitroom/nestjs-libraries/neptive/services/report.service';
import { PostizAdapter } from '@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter';
import { NeptiveClientService } from '@gitroom/nestjs-libraries/neptive/services/client.service';

@Injectable()
export class NeptiveDashboardService {
  constructor(
    private clients: NeptiveClientService,
    private peds: NeptivePedService,
    private approvals: NeptiveApprovalService,
    private activities: NeptiveActivityService,
    private strategy: NeptiveStrategyService,
    private deliverables: NeptiveDeliverableService,
    private reports: NeptiveReportService,
    private postiz: PostizAdapter
  ) {}

  async agency(org: Organization, customerId: string) {
    const client = await this.clients.get(org.id, customerId);
    const [peds, pending, upcoming, published, recentWork, reports] =
      await Promise.all([
        this.peds.list(org.id, customerId),
        this.approvals.list(org.id, customerId, 'PENDING_CLIENT_APPROVAL'),
        this.postiz.postsForCustomer(org.id, customerId, 'scheduled'),
        this.postiz.postsForCustomer(org.id, customerId, 'published'),
        this.activities.list(org.id, customerId, false),
        this.reports.list(org.id, customerId, false),
      ]);
    return {
      client,
      currentPed: peds.find((ped) =>
        ['ACTIVE', 'APPROVED', 'CLIENT_REVIEW'].includes(ped.status)
      ) || peds[0],
      awaitingApproval: pending.length,
      upcoming: upcoming.posts?.slice(0, 8) || upcoming,
      published: published.posts?.slice(0, 8) || published,
      recentActivities: recentWork.slice(0, 8),
      latestReport: reports[0] || null,
    };
  }

  async portal(org: Organization, customerId: string) {
    const client = await this.clients.get(org.id, customerId);
    const [
      peds,
      pending,
      upcoming,
      published,
      recentWork,
      strategy,
      materials,
      reports,
    ] = await Promise.all([
      this.peds.list(org.id, customerId),
      this.approvals.list(org.id, customerId, 'PENDING_CLIENT_APPROVAL'),
      this.postiz.postsForCustomer(org.id, customerId, 'scheduled'),
      this.postiz.postsForCustomer(org.id, customerId, 'published'),
      this.activities.list(org.id, customerId, true),
      this.strategy.list(org.id, customerId, true),
      this.deliverables.list(org.id, customerId, true),
      this.reports.list(org.id, customerId, true),
    ]);
    const objective = strategy.find((entry) => entry.kind === 'OBJECTIVE');
    return {
      client: { id: client.id, name: client.name },
      currentPed: peds.find((ped) =>
        ['ACTIVE', 'APPROVED', 'CLIENT_REVIEW'].includes(ped.status)
      ) || peds[0],
      awaitingApproval: pending.map((item) =>
        this.approvals.visibleForClient(item)
      ),
      upcoming: upcoming.posts?.slice(0, 6) || [],
      published: published.posts?.slice(0, 6) || [],
      recentActivities: recentWork.slice(0, 8),
      currentObjective: objective || null,
      latestReport: reports[0] || null,
      recentMaterials: materials.slice(0, 6),
    };
  }
}
