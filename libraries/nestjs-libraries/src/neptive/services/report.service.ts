import { ForbiddenException, Injectable } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { NeptiveRepository } from '@gitroom/nestjs-libraries/neptive/repositories/neptive.repository';
import { NeptiveClientService } from '@gitroom/nestjs-libraries/neptive/services/client.service';
import { NeptiveActivityService } from '@gitroom/nestjs-libraries/neptive/services/activity.service';
import { PostizAdapter } from '@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter';
import { notFoundIfMissing } from '@gitroom/nestjs-libraries/neptive/domain/scope';
import { GenerateNeptiveReportDto } from '@gitroom/nestjs-libraries/neptive/dto/neptive.dto';

@Injectable()
export class NeptiveReportService {
  constructor(
    private repo: NeptiveRepository,
    private clients: NeptiveClientService,
    private activities: NeptiveActivityService,
    private postiz: PostizAdapter
  ) {}

  async list(
    orgId: string,
    customerId: string,
    publishedOnly = false
  ) {
    await this.clients.assertCustomer(orgId, customerId);
    return this.repo.listReports(orgId, customerId, publishedOnly);
  }

  async getOrForbid(orgId: string, customerId: string, id: string) {
    const unscoped = await this.repo.reportByIdUnscoped(id);
    if (
      unscoped &&
      (unscoped.orgId !== orgId || unscoped.customerId !== customerId)
    ) {
      throw new ForbiddenException();
    }
    return notFoundIfMissing(await this.repo.reportById(orgId, customerId, id));
  }

  async generate(
    org: Organization,
    customerId: string,
    body: GenerateNeptiveReportDto
  ) {
    await this.clients.assertCustomer(org.id, customerId);
    const periodStart = new Date(body.periodStart);
    const periodEnd = new Date(body.periodEnd);
    const [publishedCount, approvalCounts, activities, strategy] =
      await Promise.all([
        this.postiz.countPublishedInRange(
          org.id,
          customerId,
          periodStart,
          periodEnd
        ),
        this.repo.countApprovalsByStatus(org.id, customerId),
        this.repo.listActivities(org.id, customerId, true),
        this.repo.listStrategy(org.id, customerId, true),
      ]);
    const periodActivities = activities.filter(
      (activity) =>
        activity.occurredAt >= periodStart && activity.occurredAt <= periodEnd
    );
    const snapshot = {
      publishedCount,
      approvals: approvalCounts.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      activitiesPerformed: periodActivities.length,
      objectives: strategy
        .filter((entry) => entry.kind === 'OBJECTIVE')
        .map((entry) => entry.title),
    };
    const report = await this.repo.createReport({
      orgId: org.id,
      customerId,
      title:
        body.title ||
        `Monthly report ${periodStart.toISOString().slice(0, 7)}`,
      periodStart,
      periodEnd,
      narrative: body.narrative || '',
      snapshot,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    });
    await this.activities.system(org.id, customerId, {
      type: 'REPORT_GENERATED',
      title: `Report published: ${report.title}`,
    });
    return report;
  }

  async analytics(org: Organization, customerId: string, date: string) {
    await this.clients.assertCustomer(org.id, customerId);
    return this.postiz.analyticsForCustomer(org, customerId, date);
  }
}
