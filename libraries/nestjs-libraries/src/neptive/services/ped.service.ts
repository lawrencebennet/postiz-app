import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  NeptiveEditorialPlanStatus,
  type NeptiveEditorialPlan,
} from '@prisma/client';
import { NeptiveRepository } from '@gitroom/nestjs-libraries/neptive/repositories/neptive.repository';
import { PostizAdapter } from '@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter';
import { NeptiveClientService } from '@gitroom/nestjs-libraries/neptive/services/client.service';
import { NeptiveActivityService } from '@gitroom/nestjs-libraries/neptive/services/activity.service';
import { canTransitionPed } from '@gitroom/nestjs-libraries/neptive/domain/state-machines';
import { notFoundIfMissing } from '@gitroom/nestjs-libraries/neptive/domain/scope';
import {
  CreateNeptivePedDto,
  CreateNeptivePedItemDto,
  TransitionNeptivePedDto,
  UpdateNeptivePedDto,
} from '@gitroom/nestjs-libraries/neptive/dto/neptive.dto';

@Injectable()
export class NeptivePedService {
  constructor(
    private repo: NeptiveRepository,
    private clients: NeptiveClientService,
    private activities: NeptiveActivityService,
    private postiz: PostizAdapter
  ) {}

  private async projectPlan(
    plan: NeptiveEditorialPlan & { items: Array<any> },
    includeInternal: boolean
  ) {
    const items = await Promise.all(
      plan.items.map(async (item) => {
        const approval = item.postGroup
          ? await this.repo.approvalByGroup(plan.orgId, item.postGroup)
          : null;
        let content = null;
        let linkStatus = item.postGroup ? 'MISSING' : 'UNLINKED';
        if (item.postGroup) {
          try {
            content = await this.postiz.contentByGroup(
              plan.orgId,
              plan.customerId,
              item.postGroup,
              item.title
            );
            linkStatus = 'LINKED';
          } catch {
            // Keep stale links visible to agency users for repair, but never
            // expose a foreign group or its media to a client.
          }
        }
        const safeApproval = approval
          ? {
              id: approval.id,
              status: approval.status,
              submittedAt: approval.submittedAt,
              approvedAt: approval.approvedAt,
              requestedChangesNote: approval.requestedChangesNote,
              rejectedNote: approval.rejectedNote,
              comments: approval.comments
                .filter(
                  (comment) =>
                    includeInternal || comment.visibility === 'CLIENT_VISIBLE'
                )
                .map((comment) => ({
                  id: comment.id,
                  authorName: comment.authorName,
                  body: comment.body,
                  visibility: comment.visibility,
                  createdAt: comment.createdAt,
                })),
            }
          : null;
        return {
          ...item,
          ...(includeInternal ? {} : { notes: undefined }),
          content,
          linkStatus,
          approval: safeApproval,
        };
      })
    );
    return {
      ...plan,
      ...(includeInternal ? {} : { notes: undefined }),
      items,
    };
  }

  async list(orgId: string, customerId: string) {
    await this.clients.assertCustomer(orgId, customerId);
    const plans = await this.repo.listPeds(orgId, customerId);
    return Promise.all(plans.map((plan) => this.projectPlan(plan, true)));
  }

  async listForPortal(orgId: string, customerId: string) {
    await this.clients.assertCustomer(orgId, customerId);
    const plans = await this.repo.listPeds(orgId, customerId);
    return Promise.all(plans.map((plan) => this.projectPlan(plan, false)));
  }

  async get(orgId: string, customerId: string, id: string) {
    await this.clients.assertCustomer(orgId, customerId);
    return this.projectPlan(
      notFoundIfMissing(await this.repo.pedById(orgId, customerId, id)),
      true
    );
  }

  async getForPortal(orgId: string, customerId: string, id: string) {
    await this.clients.assertCustomer(orgId, customerId);
    return this.projectPlan(
      notFoundIfMissing(await this.repo.pedById(orgId, customerId, id)),
      false
    );
  }

  async getOrForbid(orgId: string, customerId: string, id: string) {
    const unscoped = await this.repo.pedByIdUnscoped(id);
    if (unscoped && (unscoped.orgId !== orgId || unscoped.customerId !== customerId)) {
      throw new ForbiddenException();
    }
    return this.get(orgId, customerId, id);
  }

  async create(
    orgId: string,
    customerId: string,
    userId: string,
    body: CreateNeptivePedDto
  ) {
    await this.clients.assertCustomer(orgId, customerId);
    return this.repo.createPed({
      orgId,
      customerId,
      name: body.name,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      objectives: body.objectives,
      notes: body.notes,
      createdByUserId: userId,
    });
  }

  async update(
    orgId: string,
    customerId: string,
    id: string,
    body: UpdateNeptivePedDto
  ) {
    await this.getOrForbid(orgId, customerId, id);
    await this.repo.updatePed(orgId, customerId, id, {
      ...(body.name ? { name: body.name } : {}),
      ...(body.periodStart ? { periodStart: new Date(body.periodStart) } : {}),
      ...(body.periodEnd ? { periodEnd: new Date(body.periodEnd) } : {}),
      ...(body.objectives !== undefined ? { objectives: body.objectives } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    });
    return this.get(orgId, customerId, id);
  }

  async transition(
    orgId: string,
    customerId: string,
    id: string,
    body: TransitionNeptivePedDto,
    clientUserId?: string
  ) {
    const ped = await this.getOrForbid(orgId, customerId, id);
    if (!canTransitionPed(ped.status, body.status)) {
      throw new BadRequestException('Invalid PED transition');
    }
    const extra =
      body.status === 'APPROVED'
        ? {
            approvedAt: new Date(),
            approvedByClientUserId: clientUserId || null,
          }
        : {};
    const updated = await this.repo.transitionPed(
      orgId,
      customerId,
      id,
      ped.status as NeptiveEditorialPlanStatus,
      body.status as NeptiveEditorialPlanStatus,
      extra
    );
    if (!updated.count) {
      throw new BadRequestException('PED was updated concurrently');
    }
    if (body.status === 'APPROVED') {
      await this.activities.system(orgId, customerId, {
        type: 'PED_APPROVED',
        title: `Editorial plan “${ped.name}” approved`,
        relatedPlanId: ped.id,
      });
    }
    return this.get(orgId, customerId, id);
  }

  async addItem(
    orgId: string,
    customerId: string,
    id: string,
    body: CreateNeptivePedItemDto
  ) {
    const ped = await this.getOrForbid(orgId, customerId, id);
    return this.repo.addPedItem({
      planId: ped.id,
      title: body.title,
      notes: body.notes,
      postGroup: body.postGroup,
      position: ped.items.length,
    });
  }

  async removeItem(
    orgId: string,
    customerId: string,
    id: string,
    itemId: string
  ) {
    const ped = await this.getOrForbid(orgId, customerId, id);
    await this.repo.deletePedItem(ped.id, itemId);
    return { ok: true };
  }
}
