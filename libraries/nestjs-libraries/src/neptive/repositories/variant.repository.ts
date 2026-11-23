import { BadRequestException, Injectable } from '@nestjs/common';
import { NeptiveApprovalActorType } from '@prisma/client';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

const itemSlotSelect = {
  id: true,
  planId: true,
  title: true,
  postGroup: true,
  confirmedVariantId: true,
  confirmedAt: true,
  deletedAt: true,
} as const;

@Injectable()
export class NeptiveVariantRepository {
  constructor(private prisma: PrismaService) {}

  /** Live item of a plan, with every variant row (removed ones included). */
  itemWithVariants(planId: string, itemId: string) {
    return this.prisma.neptiveEditorialPlanItem.findFirst({
      where: { id: itemId, planId, deletedAt: null },
      include: { variants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  /** The variant row for a post group in an org (unique), with its slot. */
  variantByGroup(orgId: string, postGroup: string) {
    return this.prisma.neptivePlanItemVariant.findFirst({
      where: { orgId, postGroup },
      include: { item: { select: itemSlotSelect } },
    });
  }

  variantsByGroups(orgId: string, postGroups: string[]) {
    if (!postGroups.length) return Promise.resolve([]);
    return this.prisma.neptivePlanItemVariant.findMany({
      where: { orgId, postGroup: { in: postGroups } },
      include: { item: { select: itemSlotSelect } },
    });
  }

  /** Live plan items of this org AND customer (any plan) linked to a group the legacy way. */
  liveItemsByGroup(orgId: string, customerId: string, postGroup: string) {
    return this.prisma.neptiveEditorialPlanItem.findMany({
      where: {
        postGroup,
        deletedAt: null,
        plan: { orgId, customerId, deletedAt: null },
      },
      select: { id: true, title: true, planId: true },
    });
  }

  createVariant(data: {
    orgId: string;
    customerId: string;
    itemId: string;
    postGroup: string;
    label: string;
    position: number;
    createdByUserId?: string;
  }) {
    return this.prisma.neptivePlanItemVariant.create({ data });
  }

  reactivateVariant(id: string, position: number) {
    return this.prisma.neptivePlanItemVariant.update({
      where: { id },
      data: { removedAt: null, position },
    });
  }

  updateVariant(
    itemId: string,
    id: string,
    data: { label?: string; position?: number }
  ) {
    return this.prisma.neptivePlanItemVariant.updateMany({
      where: { id, itemId, removedAt: null },
      data,
    });
  }

  async reorderVariants(itemId: string, ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.neptivePlanItemVariant.updateMany({
          where: { id, itemId, removedAt: null },
          data: { position },
        })
      )
    );
  }

  /** Soft remove; refused (count 0) when the variant is the confirmed one. */
  removeVariant(itemId: string, id: string) {
    return this.prisma.neptivePlanItemVariant.updateMany({
      where: {
        id,
        itemId,
        removedAt: null,
        // explicit null branch: `not` alone excludes NULL rows in SQL
        item: {
          OR: [{ confirmedVariantId: null }, { confirmedVariantId: { not: id } }],
        },
      },
      data: { removedAt: new Date() },
    });
  }

  /** Creates the approval row a variant needs to be actionable by the client. */
  async createClientApproval(data: {
    orgId: string;
    customerId: string;
    postGroup: string;
    title?: string;
    userId?: string;
    comment: string;
  }) {
    const approval = await this.prisma.neptiveContentApproval.create({
      data: {
        orgId: data.orgId,
        customerId: data.customerId,
        postGroup: data.postGroup,
        title: data.title,
        createdByUserId: data.userId,
        status: 'PENDING_CLIENT_APPROVAL',
        submittedAt: new Date(),
      },
    });
    await this.prisma.neptiveApprovalAction.create({
      data: {
        approvalId: approval.id,
        actorType: 'AGENCY_USER',
        actorId: data.userId,
        action: 'SUBMITTED',
        comment: data.comment,
      },
    });
    return approval;
  }

  /**
   * Client (or agency) approval of a variant = slot confirmation. One transaction:
   * the slot pointer is only set if no variant is confirmed yet, the approval only
   * moves if it is still in `from`. Either failing rolls both back.
   */
  async confirmVariant(input: {
    orgId: string;
    customerId: string;
    approvalId: string;
    from: string;
    itemId: string;
    variantId: string;
  }) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const live = await tx.neptivePlanItemVariant.count({
        where: { id: input.variantId, itemId: input.itemId, removedAt: null },
      });
      if (!live) {
        throw new BadRequestException('This variant was removed from the slot');
      }
      const slot = await tx.neptiveEditorialPlanItem.updateMany({
        where: { id: input.itemId, confirmedVariantId: null, deletedAt: null },
        data: { confirmedVariantId: input.variantId, confirmedAt: now },
      });
      if (!slot.count) {
        throw new BadRequestException('This slot is already confirmed');
      }
      const approval = await tx.neptiveContentApproval.updateMany({
        where: {
          id: input.approvalId,
          orgId: input.orgId,
          customerId: input.customerId,
          deletedAt: null,
          status: input.from as any,
        },
        data: { status: 'APPROVED', approvedAt: now },
      });
      if (!approval.count) {
        throw new BadRequestException('Approval was updated concurrently');
      }
    });
  }

  /**
   * Agency reopen. Clears the slot pointer (explicit variants) and moves the
   * approved approval back to PENDING_CLIENT_APPROVAL, recording a REOPENED action.
   */
  async reopen(input: {
    orgId: string;
    customerId: string;
    itemId: string;
    confirmedVariantId: string | null;
    approvalId: string;
    actor: { type: NeptiveApprovalActorType; id?: string };
    comment?: string;
  }) {
    await this.prisma.$transaction(async (tx) => {
      if (input.confirmedVariantId) {
        const slot = await tx.neptiveEditorialPlanItem.updateMany({
          where: {
            id: input.itemId,
            confirmedVariantId: input.confirmedVariantId,
            deletedAt: null,
          },
          data: { confirmedVariantId: null, confirmedAt: null },
        });
        if (!slot.count) {
          throw new BadRequestException('Slot was updated concurrently');
        }
      }
      const approval = await tx.neptiveContentApproval.updateMany({
        where: {
          id: input.approvalId,
          orgId: input.orgId,
          customerId: input.customerId,
          deletedAt: null,
          status: 'APPROVED',
        },
        data: { status: 'PENDING_CLIENT_APPROVAL', approvedAt: null },
      });
      if (!approval.count && !input.confirmedVariantId) {
        throw new BadRequestException('Nothing to reopen');
      }
      if (approval.count) {
        await tx.neptiveApprovalAction.create({
          data: {
            approvalId: input.approvalId,
            actorType: input.actor.type,
            actorId: input.actor.id,
            action: 'REOPENED',
            comment: input.comment,
          },
        });
      }
    });
  }
}
