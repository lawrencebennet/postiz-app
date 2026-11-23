jest.mock('@gitroom/nestjs-libraries/neptive/repositories/neptive.repository', () => ({
  NeptiveRepository: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/repositories/variant.repository', () => ({
  NeptiveVariantRepository: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/services/client.service', () => ({
  NeptiveClientService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/services/activity.service', () => ({
  NeptiveActivityService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter', () => ({
  PostizAdapter: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/services/publish-scheduler.service', () => ({
  NeptivePublishScheduler: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/repositories/slot-lock', () => ({ NeptiveSlotLock: class {} }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { NeptiveApprovalService } from './approval.service';

const CLIENT = { type: 'CLIENT_USER' as const, id: 'client-user-1', name: 'Cliente' };
const AGENCY = { type: 'AGENCY_USER' as const, id: 'user-1', name: 'Lorenzo' };

function approvalRow(extra: Record<string, unknown> = {}) {
  return {
    id: 'approval-1',
    orgId: 'org-1',
    customerId: 'customer-1',
    postGroup: 'group-1',
    title: 'Casa Pandora',
    status: 'PENDING_CLIENT_APPROVAL',
    submittedAt: new Date(),
    approvedAt: null,
    requestedChangesNote: null,
    rejectedNote: null,
    actions: [],
    comments: [],
    ...extra,
  } as any;
}

function variantRow(confirmedVariantId: string | null, extra: Record<string, unknown> = {}) {
  return {
    id: 'variant-a',
    orgId: 'org-1',
    customerId: 'customer-1',
    itemId: 'item-1',
    postGroup: 'group-1',
    label: 'A',
    removedAt: null,
    item: { id: 'item-1', title: 'Reel', confirmedVariantId, deletedAt: null },
    ...extra,
  };
}

function setup(approval = approvalRow(), variant: any = null) {
  const repo = {
    approvalByIdUnscoped: jest.fn().mockResolvedValue(approval),
    approvalById: jest.fn().mockResolvedValue(approval),
    transitionApproval: jest.fn().mockResolvedValue({ count: 1 }),
    addApprovalAction: jest.fn().mockResolvedValue(undefined),
    addApprovalComment: jest.fn().mockResolvedValue({ id: 'c1' }),
    listApprovals: jest.fn().mockResolvedValue([approval]),
  };
  const clients = { assertCustomer: jest.fn().mockResolvedValue(undefined) };
  const activities = { system: jest.fn().mockResolvedValue(undefined) };
  const postiz = {
    postsByGroup: jest.fn().mockResolvedValue([]),
    groupPreview: jest.fn().mockReturnValue(null),
    changeGroupPublishAuthorization: jest.fn(),
  };
  const variants = {
    variantByGroup: jest.fn().mockResolvedValue(variant),
    variantsByGroups: jest.fn().mockResolvedValue(variant ? [variant] : []),
    confirmVariant: jest.fn().mockResolvedValue(undefined),
    liveItemsByGroup: jest.fn().mockResolvedValue([]),
  };
  const slotLock = { run: jest.fn((_ids: string[], work: () => Promise<unknown>) => work()) };
  const scheduler = {
    scheduleApproved: jest.fn().mockResolvedValue({ status: 'SCHEDULED' }),
  };
  const service = new NeptiveApprovalService(
    repo as any,
    clients as any,
    activities as any,
    postiz as any,
    variants as any,
    scheduler as any,
    slotLock as any
  );
  return { service, repo, activities, postiz, variants, scheduler, slotLock };
}

describe('Neptive approval service', () => {
  it('a client approval hands the group to the scheduler after the approval is committed', async () => {
    const { service, postiz, activities, repo, scheduler } = setup();

    await service.transition('org-1', 'customer-1', 'approval-1', {
      status: 'APPROVED',
    } as any, CLIENT);

    expect(postiz.changeGroupPublishAuthorization).not.toHaveBeenCalled();
    expect(activities.system).toHaveBeenCalledTimes(1);
    expect(activities.system.mock.calls[0][2].type).toBe('POST_APPROVED');
    expect(scheduler.scheduleApproved).toHaveBeenCalledTimes(1);
    expect(scheduler.scheduleApproved).toHaveBeenCalledWith({
      orgId: 'org-1',
      customerId: 'customer-1',
      postGroup: 'group-1',
      title: 'Casa Pandora',
    });
    expect(repo.transitionApproval.mock.invocationCallOrder[0]).toBeLessThan(
      scheduler.scheduleApproved.mock.invocationCallOrder[0]
    );
  });

  it('the agency approving schedules the same way', async () => {
    const { service, scheduler } = setup(approvalRow(), variantRow(null));
    await service.transition('org-1', 'customer-1', 'approval-1', { status: 'APPROVED' } as any, AGENCY);
    expect(scheduler.scheduleApproved).toHaveBeenCalledTimes(1);
  });

  it('no scheduling for any decision other than APPROVED', async () => {
    for (const status of ['CHANGES_REQUESTED', 'REJECTED']) {
      const { service, scheduler } = setup(approvalRow(), variantRow(null));
      await service.transition('org-1', 'customer-1', 'approval-1', { status, comment: 'no' } as any, CLIENT);
      expect(scheduler.scheduleApproved).not.toHaveBeenCalled();
    }
  });

  it('a failed confirmation (slot already confirmed, concurrent approval) schedules nothing', async () => {
    const { service, variants, scheduler } = setup(approvalRow(), variantRow(null));
    variants.confirmVariant.mockRejectedValue(new BadRequestException('This slot is already confirmed'));
    await expect(
      service.transition('org-1', 'customer-1', 'approval-1', { status: 'APPROVED' } as any, CLIENT)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(scheduler.scheduleApproved).not.toHaveBeenCalled();
  });

  it('a second approval of an approved content is refused before scheduling', async () => {
    const { service, scheduler } = setup(approvalRow({ status: 'APPROVED' }));
    await expect(
      service.transition('org-1', 'customer-1', 'approval-1', { status: 'APPROVED' } as any, AGENCY)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(scheduler.scheduleApproved).not.toHaveBeenCalled();
  });

  it('a failed audit write after the commit neither skips the scheduling nor fails the request', async () => {
    const { service, repo, scheduler, activities } = setup(approvalRow(), variantRow(null));
    repo.addApprovalAction.mockRejectedValue(new Error('insert failed'));
    await expect(
      service.transition('org-1', 'customer-1', 'approval-1', { status: 'APPROVED' } as any, CLIENT)
    ).resolves.toMatchObject({ id: 'approval-1' });
    expect(scheduler.scheduleApproved).toHaveBeenCalledTimes(1);

    const second = setup(approvalRow(), variantRow(null));
    second.activities.system.mockRejectedValue(new Error('activity insert failed'));
    await expect(
      second.service.transition('org-1', 'customer-1', 'approval-1', { status: 'APPROVED' } as any, CLIENT)
    ).resolves.toMatchObject({ id: 'approval-1' });
    expect(second.scheduler.scheduleApproved).toHaveBeenCalledTimes(1);
    expect(activities.system).toHaveBeenCalledTimes(1); // each audit write is independent

    const comment = setup(approvalRow());
    comment.repo.addApprovalComment.mockRejectedValue(new Error('comment insert failed'));
    await expect(
      comment.service.transition('org-1', 'customer-1', 'approval-1', { status: 'CHANGES_REQUESTED', comment: 'x' } as any, CLIENT)
    ).resolves.toMatchObject({ id: 'approval-1' });
  });

  it('the decision runs inside the slot lock: variant -> its item, single content -> its PED items', async () => {
    const variantCase = setup(approvalRow(), variantRow(null));
    let inside = false;
    variantCase.slotLock.run.mockImplementation(async (_ids: string[], work: () => Promise<unknown>) => {
      inside = true;
      try {
        return await work();
      } finally {
        inside = false;
      }
    });
    variantCase.variants.confirmVariant.mockImplementation(async () => {
      expect(inside).toBe(true);
    });
    await variantCase.service.transition('org-1', 'customer-1', 'approval-1', { status: 'APPROVED' } as any, CLIENT);
    expect(variantCase.slotLock.run.mock.calls[0][0]).toEqual(['item-1']);
    expect(variantCase.variants.confirmVariant).toHaveBeenCalled();

    const single = setup();
    single.variants.liveItemsByGroup.mockResolvedValue([{ id: 'item-9' }]);
    await single.service.transition('org-1', 'customer-1', 'approval-1', { status: 'APPROVED' } as any, CLIENT);
    expect(single.variants.liveItemsByGroup).toHaveBeenCalledWith('org-1', 'customer-1', 'group-1');
    expect(single.slotLock.run.mock.calls[0][0]).toEqual(['item-9']);
  });

  it('a scheduling failure does not undo nor fail the approval', async () => {
    const { service, scheduler, activities, variants } = setup(approvalRow(), variantRow(null));
    scheduler.scheduleApproved.mockResolvedValue({ status: 'FAILED', reason: 'Temporal down' });
    await expect(
      service.transition('org-1', 'customer-1', 'approval-1', { status: 'APPROVED' } as any, CLIENT)
    ).resolves.toBeDefined();
    expect(variants.confirmVariant).toHaveBeenCalledTimes(1);
    expect(activities.system.mock.calls[0][2].type).toBe('POST_APPROVED');
  });

  it('single-post approval (no variant row) keeps the old path', async () => {
    const { service, repo, variants } = setup();
    await service.transition('org-1', 'customer-1', 'approval-1', { status: 'APPROVED' } as any, CLIENT);
    expect(repo.transitionApproval).toHaveBeenCalledTimes(1);
    expect(variants.confirmVariant).not.toHaveBeenCalled();
  });

  it('approving a variant confirms its slot atomically instead of a bare status change', async () => {
    const { service, repo, variants, postiz } = setup(approvalRow(), variantRow(null));
    await service.transition('org-1', 'customer-1', 'approval-1', { status: 'APPROVED' } as any, CLIENT);
    expect(variants.confirmVariant).toHaveBeenCalledWith({
      orgId: 'org-1',
      customerId: 'customer-1',
      approvalId: 'approval-1',
      from: 'PENDING_CLIENT_APPROVAL',
      itemId: 'item-1',
      variantId: 'variant-a',
    });
    expect(repo.transitionApproval).not.toHaveBeenCalled();
    expect(postiz.changeGroupPublishAuthorization).not.toHaveBeenCalled();
  });

  it('approving a variant schedules its own group, after the confirmation transaction', async () => {
    const { service, variants, scheduler } = setup(approvalRow(), variantRow(null));
    await service.transition('org-1', 'customer-1', 'approval-1', { status: 'APPROVED' } as any, CLIENT);
    expect(scheduler.scheduleApproved).toHaveBeenCalledWith({
      orgId: 'org-1',
      customerId: 'customer-1',
      postGroup: 'group-1',
      title: 'Reel',
    });
    expect(variants.confirmVariant.mock.invocationCallOrder[0]).toBeLessThan(
      scheduler.scheduleApproved.mock.invocationCallOrder[0]
    );
  });

  it('requesting changes on one variant only touches that variant', async () => {
    const { service, repo, variants } = setup(approvalRow(), variantRow(null));
    await service.transition(
      'org-1',
      'customer-1',
      'approval-1',
      { status: 'CHANGES_REQUESTED', comment: 'Più corto' } as any,
      CLIENT
    );
    expect(repo.transitionApproval).toHaveBeenCalledWith(
      'org-1',
      'customer-1',
      'approval-1',
      'PENDING_CLIENT_APPROVAL',
      'CHANGES_REQUESTED',
      { requestedChangesNote: 'Più corto' }
    );
    expect(variants.confirmVariant).not.toHaveBeenCalled();
  });

  it('refuses any client decision on a variant that was not chosen', async () => {
    const { service, repo, variants } = setup(approvalRow(), variantRow('variant-b'));
    for (const status of ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']) {
      await expect(
        service.transition('org-1', 'customer-1', 'approval-1', { status, comment: 'x' } as any, CLIENT)
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(repo.transitionApproval).not.toHaveBeenCalled();
    expect(variants.confirmVariant).not.toHaveBeenCalled();
  });

  it('the agency must reopen before deciding on a receded variant too', async () => {
    const { service } = setup(approvalRow(), variantRow('variant-b'));
    await expect(
      service.transition('org-1', 'customer-1', 'approval-1', { status: 'APPROVED' } as any, AGENCY)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses client comments on receded or removed variants, allows them on the confirmed one', async () => {
    const receded = setup(approvalRow(), variantRow('variant-b'));
    await expect(
      receded.service.comment('org-1', 'customer-1', 'approval-1', { body: 'x' } as any, CLIENT)
    ).rejects.toBeInstanceOf(ForbiddenException);

    const removed = setup(approvalRow(), variantRow(null, { removedAt: new Date() }));
    await expect(
      removed.service.comment('org-1', 'customer-1', 'approval-1', { body: 'x' } as any, CLIENT)
    ).rejects.toBeInstanceOf(ForbiddenException);

    const confirmed = setup(approvalRow({ status: 'APPROVED' }), variantRow('variant-a'));
    await confirmed.service.comment('org-1', 'customer-1', 'approval-1', { body: 'ok' } as any, CLIENT);
    expect(confirmed.repo.addApprovalComment).toHaveBeenCalled();

    // the agency can still annotate a receded variant
    await receded.service.comment('org-1', 'customer-1', 'approval-1', { body: 'nota' } as any, AGENCY);
    expect(receded.repo.addApprovalComment).toHaveBeenCalled();
  });

  it('scope: a variant row of another customer is refused even if the approval matched', async () => {
    const { service } = setup(approvalRow(), variantRow(null, { customerId: 'customer-2' }));
    await expect(
      service.transition('org-1', 'customer-1', 'approval-1', { status: 'APPROVED' } as any, CLIENT)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('scope: an approval of another customer is refused before any variant logic', async () => {
    const { service, variants } = setup(approvalRow({ customerId: 'customer-2' }));
    await expect(
      service.transition('org-1', 'customer-1', 'approval-1', { status: 'APPROVED' } as any, CLIENT)
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(variants.variantByGroup).not.toHaveBeenCalled();
  });

  it('the portal approvals list hides receded variants and labels the others', async () => {
    const receded = setup(approvalRow(), variantRow('variant-b'));
    expect(await receded.service.listForPortal('org-1', 'customer-1')).toEqual([]);

    const open = setup(approvalRow(), variantRow(null));
    const rows = await open.service.listForPortal('org-1', 'customer-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].variant).toMatchObject({ label: 'A', itemTitle: 'Reel' });

    const single = setup(approvalRow());
    expect(await single.service.listForPortal('org-1', 'customer-1')).toHaveLength(1);
  });
});
