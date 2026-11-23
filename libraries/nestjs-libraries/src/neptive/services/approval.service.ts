import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  NeptiveApprovalActionType,
  NeptiveApprovalActorType,
  NeptiveApprovalStatus,
  NeptiveVisibility,
} from '@prisma/client';
import { NeptiveRepository } from '@gitroom/nestjs-libraries/neptive/repositories/neptive.repository';
import { NeptiveClientService } from '@gitroom/nestjs-libraries/neptive/services/client.service';
import { NeptiveActivityService } from '@gitroom/nestjs-libraries/neptive/services/activity.service';
import { PostizAdapter } from '@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter';
import { canTransitionApproval } from '@gitroom/nestjs-libraries/neptive/domain/state-machines';
import { notFoundIfMissing } from '@gitroom/nestjs-libraries/neptive/domain/scope';
import { NeptiveVariantRepository } from '@gitroom/nestjs-libraries/neptive/repositories/variant.repository';
import { NeptivePublishScheduler } from '@gitroom/nestjs-libraries/neptive/services/publish-scheduler.service';
import { NeptiveSlotLock } from '@gitroom/nestjs-libraries/neptive/repositories/slot-lock';
import {
  VARIANT_REFUSAL_MESSAGES,
  checkVariantAction,
} from '@gitroom/nestjs-libraries/neptive/domain/variants';
import {
  CreateNeptiveApprovalCommentDto,
  CreateNeptiveApprovalDto,
  TransitionNeptiveApprovalDto,
} from '@gitroom/nestjs-libraries/neptive/dto/neptive.dto';

const ACTION_BY_STATUS: Partial<
  Record<NeptiveApprovalStatus, NeptiveApprovalActionType>
> = {
  PENDING_INTERNAL_REVIEW: 'SUBMITTED',
  PENDING_CLIENT_APPROVAL: 'APPROVED_INTERNAL',
  APPROVED: 'APPROVED_CLIENT',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REJECTED: 'REJECTED',
  DRAFT: 'RESUBMITTED',
};

const errorText = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

@Injectable()
export class NeptiveApprovalService {
  private readonly logger = new Logger('NeptiveApprovalService');

  constructor(
    private repo: NeptiveRepository,
    private clients: NeptiveClientService,
    private activities: NeptiveActivityService,
    private postiz: PostizAdapter,
    private variants: NeptiveVariantRepository,
    private scheduler: NeptivePublishScheduler,
    private slotLock: NeptiveSlotLock
  ) {}

  /**
   * The variant row behind an approval, if its post group was attached to a PED
   * slot as a variant. Every decision and client comment goes through
   * `assertVariantAllows`, so the slot rules hold for the portal approvals pages,
   * the PED page and direct API calls alike.
   */
  private async variantFor(orgId: string, customerId: string, postGroup: string) {
    const variant = await this.variants.variantByGroup(orgId, postGroup);
    if (variant && variant.customerId !== customerId) {
      throw new ForbiddenException();
    }
    return variant;
  }

  private assertVariantAllows(
    variant: Awaited<ReturnType<NeptiveApprovalService['variantFor']>>,
    kind: 'decide' | 'comment',
    actorType: NeptiveApprovalActorType
  ) {
    if (!variant) return;
    const check = checkVariantAction({ variant, slot: variant.item, kind });
    if (!check.ok) {
      const message = VARIANT_REFUSAL_MESSAGES[check.reason];
      throw actorType === 'CLIENT_USER'
        ? new ForbiddenException(message)
        : new BadRequestException(message);
    }
  }

  /** Approvals a client may still act on: receded / removed variants are hidden. */
  async listForPortal(orgId: string, customerId: string) {
    const rows = await this.list(orgId, customerId, 'PENDING_CLIENT_APPROVAL');
    const variantRows = await this.variants.variantsByGroups(
      orgId,
      rows.map((row) => row.postGroup)
    );
    const byGroup = new Map(variantRows.map((row) => [row.postGroup, row]));
    return rows
      .filter((row) => {
        const variant = byGroup.get(row.postGroup);
        return (
          !variant ||
          checkVariantAction({ variant, slot: variant.item, kind: 'decide' }).ok
        );
      })
      .map((row) => {
        const variant = byGroup.get(row.postGroup);
        return this.visibleForClient({
          ...row,
          variant: variant
            ? { id: variant.id, label: variant.label, itemTitle: variant.item?.title }
            : null,
        });
      });
  }

  private async withPost<T extends { postGroup: string }>(
    orgId: string,
    row: T
  ) {
    const posts = await this.postiz.postsByGroup(orgId, row.postGroup);
    return { ...row, post: this.postiz.groupPreview(posts) };
  }

  async list(
    orgId: string,
    customerId: string,
    status?: NeptiveApprovalStatus
  ) {
    await this.clients.assertCustomer(orgId, customerId);
    const rows = await this.repo.listApprovals(orgId, customerId, status);
    return Promise.all(rows.map((row) => this.withPost(orgId, row)));
  }

  async get(orgId: string, customerId: string, id: string) {
    await this.clients.assertCustomer(orgId, customerId);
    const row = notFoundIfMissing(
      await this.repo.approvalById(orgId, customerId, id)
    );
    return this.withPost(orgId, row);
  }

  async getOrForbid(orgId: string, customerId: string, id: string) {
    const unscoped = await this.repo.approvalByIdUnscoped(id);
    if (
      unscoped &&
      (unscoped.orgId !== orgId || unscoped.customerId !== customerId)
    ) {
      throw new ForbiddenException();
    }
    return this.get(orgId, customerId, id);
  }

  async create(
    orgId: string,
    customerId: string,
    userId: string,
    body: CreateNeptiveApprovalDto
  ) {
    await this.clients.assertCustomer(orgId, customerId);
    const posts = await this.postiz.assertPostGroupBelongsToCustomer(
      orgId,
      customerId,
      body.postGroup
    );
    const existing = await this.repo.approvalByGroup(orgId, body.postGroup);
    if (existing) {
      return this.withPost(orgId, existing);
    }
    const preview = this.postiz.groupPreview(posts);
    const created = await this.repo.createApproval({
      orgId,
      customerId,
      postGroup: body.postGroup,
      title: body.title || preview?.text?.slice(0, 120) || undefined,
      createdByUserId: userId,
      status: 'DRAFT',
    });
    return this.get(orgId, customerId, created.id);
  }

  /** PED slots (plan item ids) a post group belongs to: the variant's item, or legacy items. */
  private async slotIdsOf(orgId: string, customerId: string, postGroup: string) {
    const variant = await this.variants.variantByGroup(orgId, postGroup);
    if (variant) {
      return [variant.itemId];
    }
    const items = await this.variants.liveItemsByGroup(orgId, customerId, postGroup);
    return items.map((item) => item.id);
  }

  /**
   * The whole decision (transaction + Postiz scheduling) runs under the slot
   * lock, so an agency reopen of the same slot cannot interleave with it.
   * Everything is re-read inside the lock.
   */
  async transition(
    orgId: string,
    customerId: string,
    id: string,
    body: TransitionNeptiveApprovalDto,
    actor: { type: NeptiveApprovalActorType; id: string; name: string }
  ) {
    const scoped = await this.getOrForbid(orgId, customerId, id);
    const slots = await this.slotIdsOf(orgId, customerId, scoped.postGroup);
    return this.slotLock.run(slots, () =>
      this.transitionInSlot(orgId, customerId, id, body, actor)
    );
  }

  private async transitionInSlot(
    orgId: string,
    customerId: string,
    id: string,
    body: TransitionNeptiveApprovalDto,
    actor: { type: NeptiveApprovalActorType; id: string; name: string }
  ) {
    const approval = await this.getOrForbid(orgId, customerId, id);
    if (!canTransitionApproval(approval.status, body.status)) {
      throw new BadRequestException('Invalid approval transition');
    }
    if (
      (body.status === 'CHANGES_REQUESTED' || body.status === 'REJECTED') &&
      !body.comment?.trim()
    ) {
      throw new BadRequestException('A comment is required');
    }
    if (
      actor.type === 'CLIENT_USER' &&
      !['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'].includes(body.status)
    ) {
      throw new ForbiddenException();
    }
    if (
      actor.type === 'CLIENT_USER' &&
      approval.status !== 'PENDING_CLIENT_APPROVAL'
    ) {
      throw new ForbiddenException();
    }

    const variant = await this.variantFor(orgId, customerId, approval.postGroup);
    this.assertVariantAllows(variant, 'decide', actor.type);

    const extra: Record<string, unknown> = {};
    if (body.status === 'PENDING_INTERNAL_REVIEW') {
      extra.submittedAt = new Date();
    }
    if (body.status === 'APPROVED') {
      extra.approvedAt = new Date();
    }
    if (body.status === 'CHANGES_REQUESTED') {
      extra.requestedChangesNote = body.comment;
    }
    if (body.status === 'REJECTED') {
      extra.rejectedNote = body.comment;
    }

    if (variant && body.status === 'APPROVED') {
      // approving a variant confirms it for its slot, atomically
      await this.variants.confirmVariant({
        orgId,
        customerId,
        approvalId: id,
        from: approval.status,
        itemId: variant.itemId,
        variantId: variant.id,
      });
    } else {
      const updated = await this.repo.transitionApproval(
        orgId,
        customerId,
        id,
        approval.status,
        body.status as NeptiveApprovalStatus,
        extra
      );
      if (!updated.count) {
        throw new BadRequestException('Approval was updated concurrently');
      }
    }

    // The decision is committed above. Nothing after this point may make the
    // request fail as if it had not happened: every audit write is independent
    // and only logged when it fails; the scheduling never throws.
    await this.afterCommit(id, 'approval action', () =>
      this.repo.addApprovalAction({
        approvalId: id,
        actorType: actor.type,
        actorId: actor.id,
        action: ACTION_BY_STATUS[body.status as NeptiveApprovalStatus] || 'SUBMITTED',
        comment: body.comment,
      })
    );

    if (body.comment?.trim()) {
      await this.afterCommit(id, 'approval comment', () =>
        this.repo.addApprovalComment({
          approvalId: id,
          visibility:
            actor.type === 'CLIENT_USER' ? 'CLIENT_VISIBLE' : 'INTERNAL',
          authorType: actor.type,
          authorId: actor.id,
          authorName: actor.name,
          body: body.comment,
        })
      );
    }

    if (body.status === 'APPROVED') {
      await this.afterCommit(id, 'approval activity', () =>
        this.activities.system(orgId, customerId, {
          type: 'POST_APPROVED',
          title: variant
            ? `Variante ${variant.label} confermata${
                variant.item?.title ? `: ${variant.item.title}` : ''
              }`
            : `Content approved${approval.title ? `: ${approval.title}` : ''}`,
          relatedPostGroup: approval.postGroup,
        })
      );
      // Schedule the approved group through Postiz. Never throws; a failure
      // leaves the posts in DRAFT with an agency-only activity.
      await this.afterCommit(id, 'scheduling', () =>
        this.scheduler.scheduleApproved({
          orgId,
          customerId,
          postGroup: approval.postGroup,
          title: variant?.item?.title || approval.title,
        })
      );
    }

    try {
      return await this.get(orgId, customerId, id);
    } catch (err) {
      this.logger.error(`approval ${id}: committed, reloading it failed: ${errorText(err)}`);
      return { ...approval, status: body.status as NeptiveApprovalStatus };
    }
  }

  private async afterCommit(approvalId: string, what: string, write: () => Promise<unknown>) {
    try {
      await write();
    } catch (err) {
      this.logger.error(`approval ${approvalId}: committed, ${what} not written: ${errorText(err)}`);
    }
  }

  async comment(
    orgId: string,
    customerId: string,
    id: string,
    body: CreateNeptiveApprovalCommentDto,
    actor: { type: NeptiveApprovalActorType; id: string; name: string }
  ) {
    const approval = await this.getOrForbid(orgId, customerId, id);
    if (actor.type === 'CLIENT_USER') {
      // a client cannot write on a variant that was not chosen or was removed
      this.assertVariantAllows(
        await this.variantFor(orgId, customerId, approval.postGroup),
        'comment',
        actor.type
      );
    }
    const visibility: NeptiveVisibility =
      actor.type === 'CLIENT_USER'
        ? 'CLIENT_VISIBLE'
        : (body.visibility as NeptiveVisibility) || 'CLIENT_VISIBLE';
    return this.repo.addApprovalComment({
      approvalId: id,
      visibility,
      authorType: actor.type,
      authorId: actor.id,
      authorName: actor.name,
      body: body.body,
    });
  }

  visibleForClient<T extends { comments?: Array<{ visibility: string }> }>(
    approval: T
  ) {
    return {
      ...approval,
      comments: (approval.comments || []).filter(
        (comment) => comment.visibility === 'CLIENT_VISIBLE'
      ),
    };
  }
}
