// Approval and reopen of the same PED slot, interleaved. Both services are real,
// their stores are fakes sharing one in-memory "world"; the slot lock is an
// in-memory keyed mutex with the same contract as NeptiveSlotLock (the real
// Postgres advisory lock is exercised by neptive/dev/schedule-check.mjs).
jest.mock('@gitroom/nestjs-libraries/neptive/repositories/neptive.repository', () => ({ NeptiveRepository: class {} }));
jest.mock('@gitroom/nestjs-libraries/neptive/repositories/variant.repository', () => ({
  NeptiveVariantRepository: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/services/client.service', () => ({ NeptiveClientService: class {} }));
jest.mock('@gitroom/nestjs-libraries/neptive/services/activity.service', () => ({ NeptiveActivityService: class {} }));
jest.mock('@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter', () => ({ PostizAdapter: class {} }));
jest.mock('@gitroom/nestjs-libraries/neptive/services/publish-scheduler.service', () => ({
  NeptivePublishScheduler: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/repositories/slot-lock', () => ({ NeptiveSlotLock: class {} }));

import { BadRequestException } from '@nestjs/common';
import { NeptiveApprovalService } from './approval.service';
import { NeptiveVariantService } from './variant.service';

const CLIENT = { type: 'CLIENT_USER' as const, id: 'client-user-1', name: 'Cliente' };
const USER = { id: 'user-1', name: 'Lorenzo' };

class KeyedMutex {
  private tails = new Map<string, Promise<void>>();
  calls: string[][] = [];
  async run<T>(ids: Array<string | null | undefined>, work: () => Promise<T>): Promise<T> {
    const keys = Array.from(new Set(ids.filter(Boolean) as string[])).sort();
    this.calls.push(keys);
    const releases: Array<() => void> = [];
    for (const key of keys) {
      const previous = this.tails.get(key) || Promise.resolve();
      let release!: () => void;
      const mine = new Promise<void>((resolve) => (release = resolve));
      this.tails.set(key, previous.then(() => mine));
      await previous;
      releases.push(release);
    }
    try {
      return await work();
    } finally {
      releases.forEach((release) => release());
    }
  }
}

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

function world(lock: { run: KeyedMutex['run'] }) {
  const state = {
    confirmedVariantId: null as string | null,
    approval: 'PENDING_CLIENT_APPROVAL',
    posts: 'DRAFT' as 'DRAFT' | 'QUEUE',
    log: [] as string[],
  };
  const gate = { schedule: deferred(), unschedule: deferred() };
  const approvalRow = () => ({
    id: 'ap-b',
    orgId: 'org-1',
    customerId: 'customer-1',
    postGroup: 'g-B',
    title: 'Reel · B',
    status: state.approval,
    approvedAt: null,
    submittedAt: null,
    requestedChangesNote: null,
    rejectedNote: null,
    actions: [],
    comments: [],
  });
  const variantRow = () => ({
    id: 'vb',
    orgId: 'org-1',
    customerId: 'customer-1',
    itemId: 'item-1',
    postGroup: 'g-B',
    label: 'B',
    position: 1,
    removedAt: null,
    createdAt: new Date(),
    item: { id: 'item-1', title: 'Reel', confirmedVariantId: state.confirmedVariantId, deletedAt: null },
  });
  const repo = {
    approvalByIdUnscoped: jest.fn(async () => approvalRow()),
    approvalById: jest.fn(async () => approvalRow()),
    approvalByGroup: jest.fn(async () => approvalRow()),
    pedByIdUnscoped: jest.fn(async () => ({ id: 'plan-1', orgId: 'org-1', customerId: 'customer-1' })),
    addApprovalAction: jest.fn(async () => undefined),
    addApprovalComment: jest.fn(async () => undefined),
    createActivity: jest.fn(async () => undefined),
  };
  const variants = {
    variantByGroup: jest.fn(async () => variantRow()),
    liveItemsByGroup: jest.fn(async () => []),
    itemWithVariants: jest.fn(async () => ({
      id: 'item-1',
      planId: 'plan-1',
      postGroup: null,
      title: 'Reel',
      notes: null,
      position: 0,
      confirmedVariantId: state.confirmedVariantId,
      confirmedAt: null,
      variants: [variantRow()],
    })),
    confirmVariant: jest.fn(async () => {
      if (state.confirmedVariantId) throw new BadRequestException('This slot is already confirmed');
      state.confirmedVariantId = 'vb';
      state.approval = 'APPROVED';
      state.log.push('confirm');
    }),
    reopen: jest.fn(async () => {
      if (state.confirmedVariantId !== 'vb') throw new BadRequestException('Slot was updated concurrently');
      state.confirmedVariantId = null;
      state.approval = 'PENDING_CLIENT_APPROVAL';
      state.log.push('reopen');
    }),
  };
  // the scheduler re-reads the slot, like NeptivePublishScheduler, and is slow (Temporal)
  const scheduler = {
    scheduleApproved: jest.fn(async () => {
      state.log.push('schedule:start');
      const mayPublish = state.confirmedVariantId === 'vb'; // re-read, then the slow Temporal part
      await gate.schedule.promise;
      if (mayPublish) state.posts = 'QUEUE';
      state.log.push('schedule:end');
      return { status: 'SCHEDULED' };
    }),
    unscheduleReopened: jest.fn(async () => {
      state.log.push('unschedule:start');
      const reopened = state.confirmedVariantId !== 'vb';
      await gate.unschedule.promise;
      if (reopened) state.posts = 'DRAFT';
      state.log.push('unschedule:end');
      return { status: 'UNSCHEDULED' };
    }),
  };
  const clients = { assertCustomer: jest.fn(async () => undefined) };
  const activities = { system: jest.fn(async () => undefined) };
  const postiz = {
    postsByGroup: jest.fn(async () => []),
    groupPreview: jest.fn(() => null),
    contentByGroup: jest.fn(async () => null),
  };
  const approvals = new NeptiveApprovalService(
    repo as any,
    clients as any,
    activities as any,
    postiz as any,
    variants as any,
    scheduler as any,
    lock as any
  );
  const slots = new NeptiveVariantService(repo as any, variants as any, postiz as any, approvals, scheduler as any, lock as any);
  const consistent = () =>
    (state.confirmedVariantId === 'vb' && state.posts === 'QUEUE') ||
    (state.confirmedVariantId === null && state.posts === 'DRAFT');
  return { state, gate, approvals, slots, consistent, variants, scheduler };
}

const approve = (w: ReturnType<typeof world>) =>
  w.approvals.transition('org-1', 'customer-1', 'ap-b', { status: 'APPROVED' } as any, CLIENT);
const reopen = (w: ReturnType<typeof world>) =>
  w.slots.reopen('org-1', 'customer-1', 'plan-1', 'item-1', USER, {});

describe('approval and reopen of one slot are serialized', () => {
  it('approval scheduling in progress, reopen arrives: the reopen waits, the end state is consistent', async () => {
    const lock = new KeyedMutex();
    const w = world(lock);
    const approving = approve(w);
    await tick();
    await tick();
    expect(w.state.log).toEqual(['confirm', 'schedule:start']);
    const reopening = reopen(w);
    await tick();
    await tick();
    expect(w.variants.reopen).not.toHaveBeenCalled(); // waiting for the slot
    w.gate.schedule.resolve();
    w.gate.unschedule.resolve();
    await approving;
    await reopening;
    expect(w.state.log).toEqual(['confirm', 'schedule:start', 'schedule:end', 'reopen', 'unschedule:start', 'unschedule:end']);
    expect(w.state).toMatchObject({ confirmedVariantId: null, posts: 'DRAFT' });
    expect(w.consistent()).toBe(true);
    expect(lock.calls).toEqual([['item-1'], ['item-1']]);
  });

  it('unscheduling in progress, a new approval arrives: it waits, then confirms and schedules', async () => {
    const lock = new KeyedMutex();
    const w = world(lock);
    w.state.confirmedVariantId = 'vb';
    w.state.approval = 'APPROVED';
    w.state.posts = 'QUEUE';
    const reopening = reopen(w);
    await tick();
    await tick();
    expect(w.state.log).toEqual(['reopen', 'unschedule:start']);
    const approving = approve(w);
    await tick();
    await tick();
    expect(w.variants.confirmVariant).not.toHaveBeenCalled();
    w.gate.unschedule.resolve();
    w.gate.schedule.resolve();
    await reopening;
    await approving;
    expect(w.state).toMatchObject({ confirmedVariantId: 'vb', posts: 'QUEUE' });
    expect(w.consistent()).toBe(true);
  });

  it('control: WITHOUT the lock the same interleaving ends inconsistent (reopened, posts queued)', async () => {
    const w = world({ run: (_ids: unknown, work: () => Promise<unknown>) => work() } as any);
    const approving = approve(w);
    await tick();
    await tick();
    const reopening = reopen(w);
    await tick();
    await tick();
    w.gate.unschedule.resolve();
    await reopening;
    w.gate.schedule.resolve();
    await approving;
    // the scheduler's re-read alone cannot catch a reopen that lands mid-scheduling
    expect(w.consistent()).toBe(false);
  });
});
