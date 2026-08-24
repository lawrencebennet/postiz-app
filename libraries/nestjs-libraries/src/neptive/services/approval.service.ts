import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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

@Injectable()
export class NeptiveApprovalService {
  constructor(
    private repo: NeptiveRepository,
    private clients: NeptiveClientService,
    private activities: NeptiveActivityService,
    private postiz: PostizAdapter
  ) {}

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

  async transition(
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

    await this.repo.addApprovalAction({
      approvalId: id,
      actorType: actor.type,
      actorId: actor.id,
      action: ACTION_BY_STATUS[body.status as NeptiveApprovalStatus] || 'SUBMITTED',
      comment: body.comment,
    });

    if (body.comment?.trim()) {
      await this.repo.addApprovalComment({
        approvalId: id,
        visibility:
          actor.type === 'CLIENT_USER' ? 'CLIENT_VISIBLE' : 'INTERNAL',
        authorType: actor.type,
        authorId: actor.id,
        authorName: actor.name,
        body: body.comment,
      });
    }

    if (body.status === 'APPROVED') {
      await this.postiz.changeGroupPublishAuthorization(
        orgId,
        approval.postGroup,
        true
      );
      await this.activities.system(orgId, customerId, {
        type: 'POST_APPROVED',
        title: `Content approved${approval.title ? `: ${approval.title}` : ''}`,
        relatedPostGroup: approval.postGroup,
      });
      await this.activities.system(orgId, customerId, {
        type: 'POST_SCHEDULED',
        title: 'Approved content authorized for scheduling',
        relatedPostGroup: approval.postGroup,
      });
    }

    if (body.status === 'CHANGES_REQUESTED' || body.status === 'REJECTED') {
      await this.postiz.changeGroupPublishAuthorization(
        orgId,
        approval.postGroup,
        false
      );
    }

    return this.get(orgId, customerId, id);
  }

  async comment(
    orgId: string,
    customerId: string,
    id: string,
    body: CreateNeptiveApprovalCommentDto,
    actor: { type: NeptiveApprovalActorType; id: string; name: string }
  ) {
    await this.getOrForbid(orgId, customerId, id);
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
