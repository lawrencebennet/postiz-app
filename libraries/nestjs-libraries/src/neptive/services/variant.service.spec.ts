jest.mock('@gitroom/nestjs-libraries/neptive/repositories/neptive.repository', () => ({
  NeptiveRepository: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/repositories/variant.repository', () => ({
  NeptiveVariantRepository: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter', () => ({
  PostizAdapter: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/services/approval.service', () => ({
  NeptiveApprovalService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/services/publish-scheduler.service', () => ({
  NeptivePublishScheduler: class {},
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { NeptiveVariantService } from './variant.service';

const PLAN = { id: 'plan-1', orgId: 'org-1', customerId: 'customer-1' };
const USER = { id: 'user-1', name: 'Lorenzo' };

const approval = (postGroup: string, status: string, comments: any[] = []) => ({
  id: `ap-${postGroup}`,
  orgId: 'org-1',
  customerId: 'customer-1',
  postGroup,
  status,
  submittedAt: null,
  approvedAt: status === 'APPROVED' ? new Date('2026-11-19') : null,
  requestedChangesNote: null,
  rejectedNote: null,
  comments,
  actions: [],
});

const content = (postGroup: string) => ({
  postGroup,
  title: 't',
  caption: `caption ${postGroup}`,
  platform: 'instagram',
  platforms: ['instagram'],
  channel: 'IG',
  scheduledAt: '2026-12-09T17:30:00.000Z',
  contentType: 'REEL',
  media: [],
  publishingState: 'QUEUE',
  postIds: ['p'],
  variants: [],
});

function item(extra: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    planId: 'plan-1',
    postGroup: null,
    title: 'Reel New Life',
    notes: 'internal note',
    position: 0,
    confirmedVariantId: null,
    confirmedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    variants: [],
    ...extra,
  } as any;
}

const row = (id: string, label: string, position: number, extra: Record<string, unknown> = {}) => ({
  id,
  itemId: 'item-1',
  orgId: 'org-1',
  customerId: 'customer-1',
  postGroup: `g-${label}`,
  label,
  position,
  removedAt: null,
  createdAt: new Date(),
  ...extra,
});

function setup(opts: {
  approvals?: Record<string, any>;
  itemRow?: any;
  plan?: any;
  variantByGroup?: any;
} = {}) {
  const approvals = opts.approvals || {};
  const repo = {
    approvalByGroup: jest.fn(async (_org: string, group: string) => approvals[group] || null),
    pedByIdUnscoped: jest.fn().mockResolvedValue(opts.plan || PLAN),
    createActivity: jest.fn().mockResolvedValue(undefined),
  };
  const variants = {
    itemWithVariants: jest.fn().mockResolvedValue(opts.itemRow || item()),
    variantByGroup: jest.fn().mockResolvedValue(opts.variantByGroup || null),
    liveItemsByGroup: jest.fn().mockResolvedValue([]),
    createVariant: jest.fn(async (data: any) => ({ id: `new-${data.label}`, removedAt: null, createdAt: new Date(), ...data })),
    createClientApproval: jest.fn().mockResolvedValue({ id: 'ap-new', status: 'PENDING_CLIENT_APPROVAL' }),
    reopen: jest.fn().mockResolvedValue(undefined),
    removeVariant: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const postiz = {
    contentByGroup: jest.fn(async (_o: string, _c: string, group: string) => content(group)),
    assertPostGroupBelongsToCustomer: jest.fn().mockResolvedValue([{}]),
  };
  const approvalService = { transition: jest.fn() };
  const scheduler = { unscheduleReopened: jest.fn().mockResolvedValue({ status: 'UNSCHEDULED' }) };
  const service = new NeptiveVariantService(
    repo as any,
    variants as any,
    postiz as any,
    approvalService as any,
    scheduler as any
  );
  return { service, repo, variants, postiz, approvalService, scheduler };
}

describe('variant projection', () => {
  it('a legacy single-post item is one implicit variant A with its existing approval', async () => {
    const { service } = setup({ approvals: { 'g-legacy': approval('g-legacy', 'PENDING_CLIENT_APPROVAL') } });
    const projected: any = await service.projectItem(PLAN as any, item({ postGroup: 'g-legacy' }), false);
    expect(projected.slot).toMatchObject({ mode: 'SINGLE', state: 'OPEN' });
    expect(projected.variants).toHaveLength(1);
    expect(projected.variants[0]).toMatchObject({ label: 'A', implicit: true, state: 'TO_REVIEW' });
    // the item keeps the fields the calendar and cards already read
    expect(projected.content.postGroup).toBe('g-legacy');
    expect(projected.approval.id).toBe('ap-g-legacy');
    expect(projected.linkStatus).toBe('LINKED');
    expect(projected.notes).toBeUndefined();
  });

  it('a legacy item approved before keeps showing as confirmed', async () => {
    const { service } = setup({ approvals: { 'g-legacy': approval('g-legacy', 'APPROVED') } });
    const projected: any = await service.projectItem(PLAN as any, item({ postGroup: 'g-legacy' }), false);
    expect(projected.slot.state).toBe('CONFIRMED');
    expect(projected.variants[0].state).toBe('CONFIRMED');
  });

  it('an unlinked legacy item has no variant', async () => {
    const { service } = setup();
    const projected: any = await service.projectItem(PLAN as any, item(), false);
    expect(projected.variants).toEqual([]);
    expect(projected.linkStatus).toBe('UNLINKED');
    expect(projected.content).toBeNull();
  });

  it('variant mode: ordered, states per variant, lead = confirmed, removed hidden from the client', async () => {
    const rows = [row('vb', 'B', 1), row('va', 'A', 0), row('vc', 'C', 2, { removedAt: new Date() })];
    const { service } = setup({
      approvals: {
        'g-A': approval('g-A', 'CHANGES_REQUESTED', [
          { id: 'c1', visibility: 'INTERNAL', authorName: 'Neptive', body: 'internal', authorType: 'AGENCY_USER', createdAt: new Date() },
          { id: 'c2', visibility: 'CLIENT_VISIBLE', authorName: 'Aurora', body: 'più corto', authorType: 'CLIENT_USER', createdAt: new Date() },
        ]),
        'g-B': approval('g-B', 'APPROVED'),
      },
    });
    const projected: any = await service.projectItem(
      PLAN as any,
      item({ variants: rows, confirmedVariantId: 'vb', postGroup: 'g-A' }),
      false
    );
    expect(projected.slot).toMatchObject({ mode: 'VARIANTS', state: 'CONFIRMED', confirmedVariantId: 'vb' });
    expect(projected.variants.map((v: any) => [v.label, v.state])).toEqual([
      ['A', 'NOT_CHOSEN'],
      ['B', 'CONFIRMED'],
    ]);
    expect(projected.content.postGroup).toBe('g-B');
    expect(projected.variants[0].approval.comments.map((c: any) => c.body)).toEqual(['più corto']);
    expect(projected.variants[0].client).toEqual({ canDecide: false, canComment: false });
    expect(projected.variants[0].agency).toBeUndefined();
    expect(projected.removedVariants).toBeUndefined();
  });

  it('agency projection keeps internal comments, capabilities and removed variants', async () => {
    const rows = [row('va', 'A', 0), row('vc', 'C', 2, { removedAt: new Date() })];
    const { service } = setup({ approvals: { 'g-A': approval('g-A', 'CHANGES_REQUESTED') } });
    const projected: any = await service.projectItem(PLAN as any, item({ variants: rows }), true);
    expect(projected.variants[0].agency).toEqual({ canRemove: true, canSendToClient: true });
    expect(projected.removedVariants.map((v: any) => v.label)).toEqual(['C']);
    expect(projected.notes).toBe('internal note');
  });

  it('never exposes an approval that belongs to another customer', async () => {
    const foreign = { ...approval('g-A', 'PENDING_CLIENT_APPROVAL'), customerId: 'customer-2' };
    const { service } = setup({ approvals: { 'g-A': foreign } });
    const projected: any = await service.projectItem(PLAN as any, item({ variants: [row('va', 'A', 0)] }), false);
    expect(projected.variants[0].approval).toBeNull();
    expect(projected.variants[0].state).toBe('IN_PREPARATION');
  });
});

describe('variant agency actions', () => {
  it('refuses to load an item of another customer', async () => {
    const { service } = setup({ plan: { ...PLAN, customerId: 'customer-2' } });
    await expect(
      service.attach('org-1', 'customer-1', 'plan-1', 'item-1', USER, { postGroup: 'g-x' })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('first attach on a legacy item turns its post into variant A, the new one into B', async () => {
    const { service, variants } = setup({ itemRow: item({ postGroup: 'g-legacy' }) });
    await service.attach('org-1', 'customer-1', 'plan-1', 'item-1', USER, { postGroup: 'g-new' });
    const created = variants.createVariant.mock.calls.map((call: any[]) => [call[0].postGroup, call[0].label, call[0].position]);
    expect(created).toEqual([
      ['g-legacy', 'A', 0],
      ['g-new', 'B', 1],
    ]);
    // both get an approval in front of the client
    expect(variants.createClientApproval).toHaveBeenCalledTimes(2);
  });

  it('refuses to add variants to a confirmed slot', async () => {
    const { service, variants } = setup({
      itemRow: item({ variants: [row('va', 'A', 0)], confirmedVariantId: 'va' }),
    });
    await expect(
      service.attach('org-1', 'customer-1', 'plan-1', 'item-1', USER, { postGroup: 'g-new' })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(variants.createVariant).not.toHaveBeenCalled();
  });

  it('refuses a post that is already a variant of another slot', async () => {
    const { service } = setup({
      variantByGroup: { ...row('vz', 'A', 0), itemId: 'item-9', item: { title: 'Altro' } },
    });
    await expect(
      service.attach('org-1', 'customer-1', 'plan-1', 'item-1', USER, { postGroup: 'g-A' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to remove the confirmed variant', async () => {
    const { service, variants } = setup({
      itemRow: item({ variants: [row('va', 'A', 0)], confirmedVariantId: 'va' }),
    });
    await expect(service.remove('org-1', 'customer-1', 'plan-1', 'item-1', 'va')).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(variants.removeVariant).not.toHaveBeenCalled();
  });

  it('reopen clears the confirmation and writes a client-visible activity', async () => {
    const { service, variants, repo } = setup({
      itemRow: item({ variants: [row('va', 'A', 0), row('vb', 'B', 1)], confirmedVariantId: 'vb' }),
      approvals: { 'g-B': approval('g-B', 'APPROVED') },
    });
    await service.reopen('org-1', 'customer-1', 'plan-1', 'item-1', USER, { comment: 'rivediamo' });
    expect(variants.reopen).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item-1', confirmedVariantId: 'vb', approvalId: 'ap-g-B', comment: 'rivediamo' })
    );
    expect(repo.createActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SLOT_REOPENED', visibility: 'CLIENT_VISIBLE', performedByUserId: 'user-1' })
    );
  });

  it('reopen unschedules the posts of the variant that was confirmed, after the reopen is committed', async () => {
    const { service, variants, scheduler } = setup({
      itemRow: item({ variants: [row('va', 'A', 0), row('vb', 'B', 1)], confirmedVariantId: 'vb' }),
      approvals: { 'g-B': approval('g-B', 'APPROVED') },
    });
    await service.reopen('org-1', 'customer-1', 'plan-1', 'item-1', USER, {});
    expect(scheduler.unscheduleReopened).toHaveBeenCalledWith({
      orgId: 'org-1',
      customerId: 'customer-1',
      postGroup: 'g-B',
      title: 'Reel New Life',
    });
    expect(variants.reopen.mock.invocationCallOrder[0]).toBeLessThan(
      scheduler.unscheduleReopened.mock.invocationCallOrder[0]
    );
  });

  it('reopen of a single-content item unschedules its group', async () => {
    const { service, scheduler } = setup({
      itemRow: item({ postGroup: 'g-legacy' }),
      approvals: { 'g-legacy': approval('g-legacy', 'APPROVED') },
    });
    await service.reopen('org-1', 'customer-1', 'plan-1', 'item-1', USER, {});
    expect(scheduler.unscheduleReopened).toHaveBeenCalledWith(expect.objectContaining({ postGroup: 'g-legacy' }));
  });

  it('a reopen that fails unschedules nothing', async () => {
    const { service, variants, scheduler } = setup({
      itemRow: item({ variants: [row('vb', 'B', 1)], confirmedVariantId: 'vb' }),
      approvals: { 'g-B': approval('g-B', 'APPROVED') },
    });
    variants.reopen.mockRejectedValue(new BadRequestException('Slot was updated concurrently'));
    await expect(
      service.reopen('org-1', 'customer-1', 'plan-1', 'item-1', USER, {})
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(scheduler.unscheduleReopened).not.toHaveBeenCalled();
  });

  it('reopen refuses a slot that is not confirmed', async () => {
    const { service, variants, scheduler } = setup({
      itemRow: item({ variants: [row('va', 'A', 0)] }),
      approvals: { 'g-A': approval('g-A', 'PENDING_CLIENT_APPROVAL') },
    });
    await expect(
      service.reopen('org-1', 'customer-1', 'plan-1', 'item-1', USER, {})
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(variants.reopen).not.toHaveBeenCalled();
    expect(scheduler.unscheduleReopened).not.toHaveBeenCalled();
  });

  it('send-to-client walks the approval state machine from changes requested', async () => {
    const { service, approvalService } = setup({
      itemRow: item({ variants: [row('va', 'A', 0)] }),
      approvals: { 'g-A': approval('g-A', 'CHANGES_REQUESTED') },
    });
    await service.sendToClient('org-1', 'customer-1', 'plan-1', 'item-1', USER, { variantId: 'va' });
    expect(approvalService.transition.mock.calls.map((call: any[]) => call[3].status)).toEqual([
      'PENDING_INTERNAL_REVIEW',
      'PENDING_CLIENT_APPROVAL',
    ]);
  });
});
