import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { NeptiveEditorialPlan } from '@prisma/client';
import { NeptiveRepository } from '@gitroom/nestjs-libraries/neptive/repositories/neptive.repository';
import { NeptiveVariantRepository } from '@gitroom/nestjs-libraries/neptive/repositories/variant.repository';
import { PostizAdapter } from '@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter';
import { NeptiveApprovalService } from '@gitroom/nestjs-libraries/neptive/services/approval.service';
import {
  legacyClientState,
  liveVariants,
  nextVariantLabel,
  sortVariants,
  variantClientState,
  type VariantClientState,
} from '@gitroom/nestjs-libraries/neptive/domain/variants';
import {
  AttachNeptiveVariantDto,
  ReopenNeptiveSlotDto,
  ReorderNeptiveVariantsDto,
  SendNeptiveVariantDto,
  UpdateNeptiveVariantDto,
} from '@gitroom/nestjs-libraries/neptive/dto/neptive.dto';

type Actor = { id: string; name: string };

type VariantRow = {
  id: string;
  itemId: string;
  postGroup: string;
  label: string;
  position: number;
  removedAt: Date | null;
  createdAt: Date;
};

type ItemRow = {
  id: string;
  planId: string;
  postGroup: string | null;
  title: string;
  notes: string | null;
  position: number;
  confirmedVariantId: string | null;
  confirmedAt: Date | null;
  variants?: VariantRow[];
  [key: string]: unknown;
};

const SENDABLE = [
  undefined,
  null,
  'DRAFT',
  'PENDING_INTERNAL_REVIEW',
  'CHANGES_REQUESTED',
  'REJECTED',
];

const LABEL_MAX = 12;

@Injectable()
export class NeptiveVariantService {
  constructor(
    private repo: NeptiveRepository,
    private variants: NeptiveVariantRepository,
    private postiz: PostizAdapter,
    private approvals: NeptiveApprovalService
  ) {}

  // ---------------------------------------------------------------- projection

  private async projectGroup(
    plan: Pick<NeptiveEditorialPlan, 'orgId' | 'customerId'>,
    postGroup: string,
    title: string,
    includeInternal: boolean
  ) {
    const approvalRow = await this.repo.approvalByGroup(plan.orgId, postGroup);
    // an approval of another customer is never shown, whatever the data says
    const approval =
      approvalRow && approvalRow.customerId === plan.customerId
        ? approvalRow
        : null;
    let content = null;
    let linkStatus = 'MISSING';
    try {
      content = await this.postiz.contentByGroup(
        plan.orgId,
        plan.customerId,
        postGroup,
        title
      );
      linkStatus = 'LINKED';
    } catch {
      // Keep stale links visible to agency users for repair, but never
      // expose a foreign group or its media to a client.
    }
    return {
      content,
      linkStatus,
      approval: approval
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
                authorType: comment.authorType,
                body: comment.body,
                visibility: comment.visibility,
                createdAt: comment.createdAt,
              })),
            ...(includeInternal
              ? {
                  actions: approval.actions.slice(0, 10).map((action) => ({
                    action: action.action,
                    actorType: action.actorType,
                    comment: action.comment,
                    createdAt: action.createdAt,
                  })),
                }
              : {}),
          }
        : null,
    };
  }

  private capabilities(
    state: VariantClientState,
    approval: { status: string } | null,
    slotConfirmed: boolean,
    isConfirmed: boolean
  ) {
    return {
      client: {
        canDecide: state === 'TO_REVIEW',
        canComment: !!approval && state !== 'NOT_CHOSEN',
      },
      agency: {
        canRemove: !isConfirmed,
        canSendToClient: !slotConfirmed && SENDABLE.includes(approval?.status),
      },
    };
  }

  /**
   * One PED item as a slot with 1..N variants. A legacy item (no variant rows,
   * postGroup set) is projected as a single implicit variant "A" whose decision
   * is its existing approval: same data, same behaviour as before.
   * `content` / `approval` / `linkStatus` on the item stay populated with the
   * lead variant (confirmed one, else the first) for the calendar and cards.
   */
  async projectItem(
    plan: Pick<NeptiveEditorialPlan, 'orgId' | 'customerId'>,
    item: ItemRow,
    includeInternal: boolean
  ) {
    const { variants: rawRows, ...itemFields } = item;
    const rows = sortVariants(rawRows || []);
    const mode = rows.length ? 'VARIANTS' : 'SINGLE';
    let variants: any[] = [];
    let confirmedVariantId: string | null = null;

    if (mode === 'SINGLE') {
      if (item.postGroup) {
        const projected = await this.projectGroup(
          plan,
          item.postGroup,
          item.title,
          includeInternal
        );
        const state = legacyClientState(projected.approval?.status);
        const id = `item:${item.id}`;
        confirmedVariantId = state === 'CONFIRMED' ? id : null;
        variants = [
          {
            id,
            implicit: true,
            label: 'A',
            position: 0,
            postGroup: item.postGroup,
            ...projected,
            state,
            ...this.capabilities(
              state,
              projected.approval,
              !!confirmedVariantId,
              true // the only content of a single item is never removed as a variant
            ),
          },
        ];
      }
    } else {
      confirmedVariantId = item.confirmedVariantId;
      variants = await Promise.all(
        liveVariants(rows).map(async (row) => {
          const projected = await this.projectGroup(
            plan,
            row.postGroup,
            item.title,
            includeInternal
          );
          const state = variantClientState({
            variantId: row.id,
            slot: item,
            approvalStatus: projected.approval?.status,
          });
          return {
            id: row.id,
            implicit: false,
            label: row.label,
            position: row.position,
            postGroup: row.postGroup,
            ...projected,
            state,
            ...this.capabilities(
              state,
              projected.approval,
              !!confirmedVariantId,
              row.id === confirmedVariantId
            ),
          };
        })
      );
    }

    const lead =
      variants.find((variant) => variant.id === confirmedVariantId) ||
      variants[0];
    return {
      ...itemFields,
      ...(includeInternal ? {} : { notes: undefined }),
      content: lead?.content ?? null,
      linkStatus: lead ? lead.linkStatus : 'UNLINKED',
      approval: lead?.approval ?? null,
      slot: {
        mode,
        state: confirmedVariantId ? 'CONFIRMED' : 'OPEN',
        confirmedVariantId,
        confirmedAt: mode === 'VARIANTS' ? item.confirmedAt : lead?.approval?.approvedAt ?? null,
      },
      variants: includeInternal
        ? variants
        : variants.map(({ agency, ...rest }) => rest),
      ...(includeInternal
        ? {
            removedVariants: rows
              .filter((row) => row.removedAt)
              .map((row) => ({
                id: row.id,
                label: row.label,
                postGroup: row.postGroup,
                removedAt: row.removedAt,
              })),
          }
        : {}),
    };
  }

  // ------------------------------------------------------------------- loading

  private async loadItem(
    orgId: string,
    customerId: string,
    planId: string,
    itemId: string
  ) {
    const plan = await this.repo.pedByIdUnscoped(planId);
    if (!plan) throw new NotFoundException();
    if (plan.orgId !== orgId || plan.customerId !== customerId) {
      throw new ForbiddenException();
    }
    const item = await this.variants.itemWithVariants(planId, itemId);
    if (!item) throw new NotFoundException();
    return { plan, item };
  }

  async getItem(
    orgId: string,
    customerId: string,
    planId: string,
    itemId: string
  ) {
    const { plan, item } = await this.loadItem(orgId, customerId, planId, itemId);
    return this.projectItem(plan, item as ItemRow, true);
  }

  private normalizeLabel(label: string) {
    const value = label.trim();
    if (!value || value.length > LABEL_MAX) {
      throw new BadRequestException(
        `A variant label must be 1-${LABEL_MAX} characters`
      );
    }
    return value;
  }

  private assertLabelFree(
    rows: VariantRow[],
    label: string,
    exceptId?: string
  ) {
    const taken = rows.some(
      (row) =>
        !row.removedAt &&
        row.id !== exceptId &&
        row.label.trim().toUpperCase() === label.toUpperCase()
    );
    if (taken) {
      throw new BadRequestException(`Label "${label}" is already used in this slot`);
    }
  }

  private async ensureClientApproval(
    orgId: string,
    customerId: string,
    postGroup: string,
    title: string,
    label: string,
    user: Actor
  ) {
    const existing = await this.repo.approvalByGroup(orgId, postGroup);
    if (existing) {
      if (existing.customerId !== customerId) throw new ForbiddenException();
      return existing;
    }
    return this.variants.createClientApproval({
      orgId,
      customerId,
      postGroup,
      title: `${title} · ${label}`,
      userId: user.id,
      comment: `Variante ${label} proposta al cliente`,
    });
  }

  // ----------------------------------------------------------------- mutations

  async attach(
    orgId: string,
    customerId: string,
    planId: string,
    itemId: string,
    user: Actor,
    body: AttachNeptiveVariantDto
  ) {
    const { item } = await this.loadItem(orgId, customerId, planId, itemId);
    const postGroup = body.postGroup;
    await this.postiz.assertPostGroupBelongsToCustomer(orgId, customerId, postGroup);

    if (item.confirmedVariantId) {
      throw new BadRequestException(
        'This slot is confirmed: reopen it before adding variants'
      );
    }
    const rows = item.variants as VariantRow[];

    // the group must not live anywhere else
    const usedAsVariant = await this.variants.variantByGroup(orgId, postGroup);
    if (usedAsVariant && usedAsVariant.itemId !== item.id) {
      throw new BadRequestException(
        `This post is already a variant of "${usedAsVariant.item?.title || 'another item'}"`
      );
    }
    if (usedAsVariant && !usedAsVariant.removedAt) {
      throw new BadRequestException('This post is already a variant of this slot');
    }
    const linkedItems = await this.variants.liveItemsByGroup(orgId, postGroup);
    if (linkedItems.some((linked) => linked.id !== item.id)) {
      throw new BadRequestException(
        `This post is already linked to plan item "${linkedItems[0].title}"`
      );
    }
    if (!rows.length && item.postGroup === postGroup) {
      throw new BadRequestException('This post is already the content of this slot');
    }
    const approval = await this.repo.approvalByGroup(orgId, postGroup);
    if (approval?.status === 'APPROVED' && !usedAsVariant) {
      throw new BadRequestException(
        'This post is already approved as a single content'
      );
    }

    // first variant on a legacy single-post item: its post becomes variant A
    if (!rows.length && item.postGroup) {
      const legacyApproval = await this.repo.approvalByGroup(orgId, item.postGroup);
      if (legacyApproval?.status === 'APPROVED') {
        throw new BadRequestException(
          'This content is already approved: reopen the slot before adding variants'
        );
      }
      const legacy = await this.variants.createVariant({
        orgId,
        customerId,
        itemId: item.id,
        postGroup: item.postGroup,
        label: 'A',
        position: 0,
        createdByUserId: user.id,
      });
      rows.push({ ...legacy });
      await this.ensureClientApproval(orgId, customerId, item.postGroup, item.title, 'A', user);
    }

    // a re-attached (previously removed) variant keeps its label unless renamed
    const label = body.label
      ? this.normalizeLabel(body.label)
      : usedAsVariant
        ? usedAsVariant.label
        : nextVariantLabel(rows);
    this.assertLabelFree(rows, label, usedAsVariant?.id);
    const position =
      Math.max(-1, ...rows.filter((row) => !row.removedAt).map((row) => row.position)) + 1;

    if (usedAsVariant) {
      await this.variants.reactivateVariant(usedAsVariant.id, position);
      await this.variants.updateVariant(item.id, usedAsVariant.id, { label });
    } else {
      await this.variants.createVariant({
        orgId,
        customerId,
        itemId: item.id,
        postGroup,
        label,
        position,
        createdByUserId: user.id,
      });
    }
    await this.ensureClientApproval(orgId, customerId, postGroup, item.title, label, user);
    return this.getItem(orgId, customerId, planId, itemId);
  }

  async update(
    orgId: string,
    customerId: string,
    planId: string,
    itemId: string,
    variantId: string,
    body: UpdateNeptiveVariantDto
  ) {
    const { item } = await this.loadItem(orgId, customerId, planId, itemId);
    const rows = item.variants as VariantRow[];
    if (!rows.some((row) => row.id === variantId && !row.removedAt)) {
      throw new NotFoundException();
    }
    const label = this.normalizeLabel(body.label);
    this.assertLabelFree(rows, label, variantId);
    await this.variants.updateVariant(item.id, variantId, { label });
    return this.getItem(orgId, customerId, planId, itemId);
  }

  async reorder(
    orgId: string,
    customerId: string,
    planId: string,
    itemId: string,
    body: ReorderNeptiveVariantsDto
  ) {
    const { item } = await this.loadItem(orgId, customerId, planId, itemId);
    const live = liveVariants(item.variants as VariantRow[]).map((row) => row.id);
    const wanted = body.variantIds;
    if (
      wanted.length !== live.length ||
      new Set(wanted).size !== wanted.length ||
      wanted.some((id) => !live.includes(id))
    ) {
      throw new BadRequestException('variantIds must list every live variant once');
    }
    await this.variants.reorderVariants(item.id, wanted);
    return this.getItem(orgId, customerId, planId, itemId);
  }

  async remove(
    orgId: string,
    customerId: string,
    planId: string,
    itemId: string,
    variantId: string
  ) {
    const { item } = await this.loadItem(orgId, customerId, planId, itemId);
    if (item.confirmedVariantId === variantId) {
      throw new BadRequestException(
        'The confirmed variant cannot be removed: reopen the slot first'
      );
    }
    const removed = await this.variants.removeVariant(item.id, variantId);
    if (!removed.count) {
      throw new NotFoundException();
    }
    return this.getItem(orgId, customerId, planId, itemId);
  }

  /** Puts one variant (or every sendable one) in front of the client. */
  async sendToClient(
    orgId: string,
    customerId: string,
    planId: string,
    itemId: string,
    user: Actor,
    body: SendNeptiveVariantDto
  ) {
    const { item } = await this.loadItem(orgId, customerId, planId, itemId);
    const rows = liveVariants(item.variants as VariantRow[]);
    if (item.confirmedVariantId) {
      throw new BadRequestException('This slot is already confirmed');
    }
    const targets: Array<{ postGroup: string; label: string }> = rows.length
      ? rows
          .filter((row) => !body.variantId || row.id === body.variantId)
          .map((row) => ({ postGroup: row.postGroup, label: row.label }))
      : item.postGroup && (!body.variantId || body.variantId === `item:${item.id}`)
        ? [{ postGroup: item.postGroup, label: 'A' }]
        : [];
    if (!targets.length) {
      throw new NotFoundException();
    }
    const agencyActor = { type: 'AGENCY_USER' as const, id: user.id, name: user.name };
    for (const target of targets) {
      await this.postiz.assertPostGroupBelongsToCustomer(orgId, customerId, target.postGroup);
      const approval = await this.ensureClientApproval(
        orgId,
        customerId,
        target.postGroup,
        item.title,
        target.label,
        user
      );
      // walk the existing approval state machine up to the client
      const path: Record<string, string[]> = {
        DRAFT: ['PENDING_INTERNAL_REVIEW', 'PENDING_CLIENT_APPROVAL'],
        CHANGES_REQUESTED: ['PENDING_INTERNAL_REVIEW', 'PENDING_CLIENT_APPROVAL'],
        REJECTED: ['PENDING_INTERNAL_REVIEW', 'PENDING_CLIENT_APPROVAL'],
        PENDING_INTERNAL_REVIEW: ['PENDING_CLIENT_APPROVAL'],
      };
      for (const status of path[approval.status] || []) {
        await this.approvals.transition(
          orgId,
          customerId,
          approval.id,
          { status } as any,
          agencyActor
        );
      }
    }
    return this.getItem(orgId, customerId, planId, itemId);
  }

  /** Agency only: undo a confirmation so the client can choose again. */
  async reopen(
    orgId: string,
    customerId: string,
    planId: string,
    itemId: string,
    user: Actor,
    body: ReopenNeptiveSlotDto
  ) {
    const { item } = await this.loadItem(orgId, customerId, planId, itemId);
    const rows = item.variants as VariantRow[];
    let postGroup: string | null = null;
    let label = 'A';
    if (rows.length) {
      const confirmed = rows.find((row) => row.id === item.confirmedVariantId);
      if (!confirmed) {
        throw new BadRequestException('This slot is not confirmed');
      }
      postGroup = confirmed.postGroup;
      label = confirmed.label;
    } else {
      postGroup = item.postGroup;
    }
    const approval = postGroup
      ? await this.repo.approvalByGroup(orgId, postGroup)
      : null;
    if (!approval || approval.customerId !== customerId) {
      throw new BadRequestException('This slot is not confirmed');
    }
    if (!rows.length && approval.status !== 'APPROVED') {
      throw new BadRequestException('This slot is not confirmed');
    }
    const comment = body.comment?.trim() || undefined;
    await this.variants.reopen({
      orgId,
      customerId,
      itemId: item.id,
      confirmedVariantId: rows.length ? item.confirmedVariantId : null,
      approvalId: approval.id,
      actor: { type: 'AGENCY_USER', id: user.id },
      comment,
    });
    await this.repo.createActivity({
      orgId,
      customerId,
      type: 'SLOT_REOPENED',
      title: `Scelta riaperta: ${item.title}${rows.length ? ` (era confermata la variante ${label})` : ''}`,
      body: comment || '',
      visibility: 'CLIENT_VISIBLE',
      source: 'MANUAL',
      relatedPostGroup: postGroup || undefined,
      relatedPlanId: planId,
      performedByUserId: user.id,
    });
    return this.getItem(orgId, customerId, planId, itemId);
  }
}
