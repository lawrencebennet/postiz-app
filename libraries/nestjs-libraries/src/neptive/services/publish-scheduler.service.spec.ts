jest.mock('@gitroom/nestjs-libraries/neptive/repositories/neptive.repository', () => ({
  NeptiveRepository: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/repositories/variant.repository', () => ({
  NeptiveVariantRepository: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter', () => ({
  PostizAdapter: class {},
}));

import { NeptivePublishScheduler } from './publish-scheduler.service';

const NOW = new Date('2026-11-23T08:00:00.000Z'); // 09:00 Rome
const FUTURE = new Date('2026-11-25T09:00:00.000Z'); // 10:00 Rome
const PAST = new Date('2026-11-20T09:00:00.000Z'); // 10:00 Rome, three days ago

type PostRow = {
  id: string;
  group: string;
  state: string;
  publishDate: Date;
  parentPostId: string | null;
  deletedAt: null;
  integration: { customerId: string; name: string; providerIdentifier: string };
};

const post = (id: string, state: string, extra: Partial<PostRow> = {}): PostRow => ({
  id,
  group: 'g-B',
  state,
  publishDate: FUTURE,
  parentPostId: null,
  deletedAt: null,
  integration: {
    customerId: 'customer-1',
    name: id.startsWith('fb') ? 'Casa Pandora FB' : 'casapandora',
    providerIdentifier: id.startsWith('fb') ? 'facebook' : 'instagram',
  },
  ...extra,
});

const confirmedVariant = (confirmedVariantId: string | null = 'vb', extra: Record<string, unknown> = {}) => ({
  id: 'vb',
  orgId: 'org-1',
  customerId: 'customer-1',
  itemId: 'item-1',
  postGroup: 'g-B',
  label: 'B',
  removedAt: null,
  item: { id: 'item-1', title: 'Reel', confirmedVariantId, deletedAt: null },
  ...extra,
});

function setup(opts: {
  posts?: PostRow[];
  variant?: any;
  liveItems?: any[];
  running?: (postId: string) => boolean | Promise<boolean>;
} = {}) {
  // a tiny in-memory Postiz: state changes only through the adapter calls
  const posts = (opts.posts || [post('ig-1', 'DRAFT'), post('fb-1', 'DRAFT')]).map((row) => ({ ...row }));
  const byId = new Map(posts.map((row) => [row.id, row]));
  const postiz = {
    postsByGroup: jest.fn(async () => posts.map((row) => ({ ...row }))),
    assertSchedulerReachable: jest.fn().mockResolvedValue(undefined),
    schedulePost: jest.fn(async (_org: string, id: string) => {
      const row = byId.get(id);
      if (!row) throw new Error('Post not found');
      row.state = 'QUEUE';
    }),
    unschedulePost: jest.fn(async (_org: string, id: string) => {
      byId.get(id)!.state = 'DRAFT';
    }),
    movePublishDate: jest.fn(async (_org: string, id: string, date: Date) => {
      byId.get(id)!.publishDate = date;
    }),
    postWorkflowRunning: jest.fn(async (id: string) =>
      opts.running ? opts.running(id) : byId.get(id)?.state === 'QUEUE'
    ),
  };
  const variants = {
    variantByGroup: jest.fn().mockResolvedValue(opts.variant === undefined ? confirmedVariant() : opts.variant),
    liveItemsByGroup: jest.fn().mockResolvedValue(opts.liveItems || []),
  };
  const repo = { createActivity: jest.fn().mockResolvedValue(undefined) };
  const scheduler = new NeptivePublishScheduler(repo as any, variants as any, postiz as any);
  const state = () => Object.fromEntries(posts.map((row) => [row.id, row.state]));
  return { scheduler, postiz, variants, repo, posts, state };
}

const INPUT = { orgId: 'org-1', customerId: 'customer-1', postGroup: 'g-B', title: 'Reel' };

describe('scheduling an approved post group', () => {
  it('confirmed variant: every DRAFT root of its group goes to QUEUE through the native path', async () => {
    const { scheduler, postiz, repo, state } = setup();
    const result = await scheduler.scheduleApproved(INPUT, NOW);
    expect(result.status).toBe('SCHEDULED');
    expect(postiz.schedulePost.mock.calls.map((call) => call[1])).toEqual(['ig-1', 'fb-1']);
    expect(state()).toEqual({ 'ig-1': 'QUEUE', 'fb-1': 'QUEUE' });
    expect(postiz.movePublishDate).not.toHaveBeenCalled();
    expect(repo.createActivity).toHaveBeenCalledTimes(1);
    expect(repo.createActivity.mock.calls[0][0]).toMatchObject({
      type: 'POST_SCHEDULED',
      visibility: 'CLIENT_VISIBLE',
      relatedPostGroup: 'g-B',
    });
    expect(repo.createActivity.mock.calls[0][0].body).toContain('25 novembre 2026 alle 10:00');
  });

  it('only touches roots in DRAFT: comments, QUEUE, PUBLISHED and ERROR posts stay as they are', async () => {
    const { scheduler, postiz, state } = setup({
      posts: [
        post('ig-1', 'DRAFT'),
        post('ig-comment', 'DRAFT', { parentPostId: 'ig-1' }),
        post('fb-1', 'PUBLISHED'),
        post('fb-2', 'ERROR'),
        post('fb-3', 'QUEUE'),
      ],
    });
    await scheduler.scheduleApproved(INPUT, NOW);
    expect(postiz.schedulePost.mock.calls.map((call) => call[1])).toEqual(['ig-1']);
    expect(state()).toEqual({
      'ig-1': 'QUEUE',
      'ig-comment': 'DRAFT',
      'fb-1': 'PUBLISHED',
      'fb-2': 'ERROR',
      'fb-3': 'QUEUE',
    });
  });

  it('never queues a variant that is not the confirmed one (re-read at scheduling time)', async () => {
    for (const variant of [
      confirmedVariant('va'),
      confirmedVariant(null),
      confirmedVariant('vb', { removedAt: new Date() }),
      confirmedVariant('vb', { item: { id: 'item-1', title: 'Reel', confirmedVariantId: 'vb', deletedAt: new Date() } }),
      confirmedVariant('vb', { customerId: 'customer-2' }),
    ]) {
      const { scheduler, postiz, repo, state } = setup({ variant });
      const result = await scheduler.scheduleApproved(INPUT, NOW);
      expect(result.status).toBe('FAILED');
      expect(postiz.schedulePost).not.toHaveBeenCalled();
      expect(state()).toEqual({ 'ig-1': 'DRAFT', 'fb-1': 'DRAFT' });
      expect(repo.createActivity.mock.calls[0][0]).toMatchObject({ type: 'OTHER', visibility: 'INTERNAL' });
      expect(repo.createActivity.mock.calls[0][0].title).toMatch(/^Approvato ma non programmato/);
    }
  });

  it('single-content PED item (no variant rows, item.postGroup): scheduled the same way', async () => {
    const { scheduler, state } = setup({ variant: null, liveItems: [{ id: 'item-1', title: 'Post', planId: 'p' }] });
    const result = await scheduler.scheduleApproved(INPUT, NOW);
    expect(result.status).toBe('SCHEDULED');
    expect(state()).toEqual({ 'ig-1': 'QUEUE', 'fb-1': 'QUEUE' });
  });

  it('a group that is neither a variant nor on a PED item keeps today\'s behaviour: nothing scheduled', async () => {
    const { scheduler, postiz, repo, state } = setup({ variant: null, liveItems: [] });
    const result = await scheduler.scheduleApproved(INPUT, NOW);
    expect(result.status).toBe('SKIPPED');
    expect(postiz.schedulePost).not.toHaveBeenCalled();
    expect(repo.createActivity).not.toHaveBeenCalled();
    expect(state()).toEqual({ 'ig-1': 'DRAFT', 'fb-1': 'DRAFT' });
  });

  it('a passed date moves to the next same Rome hour before scheduling, and the activity says so', async () => {
    const { scheduler, postiz, repo, posts } = setup({
      posts: [post('ig-1', 'DRAFT', { publishDate: PAST }), post('fb-1', 'DRAFT')],
    });
    await scheduler.scheduleApproved(INPUT, NOW);
    expect(postiz.movePublishDate).toHaveBeenCalledTimes(1);
    expect(postiz.movePublishDate.mock.calls[0][1]).toBe('ig-1');
    expect(postiz.movePublishDate.mock.calls[0][2].toISOString()).toBe('2026-11-23T09:00:00.000Z');
    // moved before it was queued
    expect(postiz.movePublishDate.mock.invocationCallOrder[0]).toBeLessThan(
      postiz.schedulePost.mock.invocationCallOrder[0]
    );
    expect(posts[0].publishDate.toISOString()).toBe('2026-11-23T09:00:00.000Z');
    const activity = repo.createActivity.mock.calls[0][0];
    expect(activity.visibility).toBe('CLIENT_VISIBLE');
    expect(activity.body).toContain('20 novembre 2026 alle 10:00');
    expect(activity.body).toContain('23 novembre 2026 alle 10:00');
    expect(activity.body).toMatch(/spostat/);
  });

  it('Temporal unreachable before anything changes: posts stay DRAFT, agency activity', async () => {
    const { scheduler, postiz, repo, state } = setup();
    postiz.assertSchedulerReachable.mockRejectedValue(new Error('UNAVAILABLE: connect ECONNREFUSED'));
    const result = await scheduler.scheduleApproved(INPUT, NOW);
    expect(result.status).toBe('FAILED');
    expect(postiz.schedulePost).not.toHaveBeenCalled();
    expect(postiz.movePublishDate).not.toHaveBeenCalled();
    expect(state()).toEqual({ 'ig-1': 'DRAFT', 'fb-1': 'DRAFT' });
    const activity = repo.createActivity.mock.calls[0][0];
    expect(activity).toMatchObject({ type: 'OTHER', visibility: 'INTERNAL', relatedPostGroup: 'g-B' });
    expect(activity.title).toBe('Approvato ma non programmato: Reel');
    expect(activity.body).toContain('ECONNREFUSED');
  });

  it('workflow did not start (the native start swallows errors): every post of the group goes back to DRAFT', async () => {
    const { scheduler, postiz, repo, state } = setup({ running: (id) => id !== 'fb-1' });
    const result = await scheduler.scheduleApproved(INPUT, NOW);
    expect(result.status).toBe('FAILED');
    expect(postiz.unschedulePost.mock.calls.map((call) => call[1]).sort()).toEqual(['fb-1', 'ig-1']);
    expect(state()).toEqual({ 'ig-1': 'DRAFT', 'fb-1': 'DRAFT' });
    expect(repo.createActivity.mock.calls[0][0]).toMatchObject({ type: 'OTHER', visibility: 'INTERNAL' });
  });

  it('a workflow killed by a later post of the same group is caught: the check runs after the whole group, by workflow id', async () => {
    // fake Temporal: starting fb-1 terminates ig-1's workflow (the upstream fuzzy-termination pattern)
    const alive = new Set<string>();
    const { scheduler, postiz, repo, state } = setup({ running: (id) => alive.has(id) });
    postiz.schedulePost.mockImplementation(async (_org: string, id: string) => {
      if (id === 'fb-1') alive.delete('ig-1');
      alive.add(id);
    });
    // keep the in-memory states in step with the adapter calls
    const result = await scheduler.scheduleApproved(INPUT, NOW);
    expect(result.status).toBe('FAILED');
    expect(result.reason).toContain('ig-1');
    const lastSchedule = Math.max(...postiz.schedulePost.mock.invocationCallOrder);
    expect(postiz.postWorkflowRunning.mock.invocationCallOrder.every((order) => order > lastSchedule)).toBe(true);
    expect(postiz.postWorkflowRunning.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining(['ig-1', 'fb-1'])
    );
    expect(postiz.unschedulePost.mock.calls.map((call) => call[1]).sort()).toEqual(['fb-1', 'ig-1']);
    expect(state()).toEqual({ 'ig-1': 'DRAFT', 'fb-1': 'DRAFT' });
    expect(repo.createActivity.mock.calls[0][0]).toMatchObject({ type: 'OTHER', visibility: 'INTERNAL' });
  });

  it('cannot even check the workflow: treated as a failure, back to DRAFT', async () => {
    const { scheduler, state } = setup({
      running: () => {
        throw new Error('deadline exceeded');
      },
    });
    const result = await scheduler.scheduleApproved(INPUT, NOW);
    expect(result.status).toBe('FAILED');
    expect(state()).toEqual({ 'ig-1': 'DRAFT', 'fb-1': 'DRAFT' });
  });

  it('a post that disappears mid-way: the ones already queued are rolled back', async () => {
    const { scheduler, postiz, repo, state } = setup();
    postiz.schedulePost.mockImplementationOnce(async () => undefined).mockImplementationOnce(async () => {
      throw new Error('Post not found');
    });
    const result = await scheduler.scheduleApproved(INPUT, NOW);
    expect(result.status).toBe('FAILED');
    expect(postiz.unschedulePost).toHaveBeenCalledWith('org-1', 'ig-1');
    expect(state()).toEqual({ 'ig-1': 'DRAFT', 'fb-1': 'DRAFT' });
    expect(repo.createActivity.mock.calls[0][0].body).toContain('Post not found');
  });

  it('a rollback that fails too is spelled out in the agency activity', async () => {
    const { scheduler, postiz, repo } = setup({ running: () => false });
    postiz.unschedulePost.mockRejectedValue(new Error('db down'));
    const result = await scheduler.scheduleApproved(INPUT, NOW);
    expect(result.status).toBe('FAILED');
    expect(repo.createActivity.mock.calls[0][0].body).toMatch(/ATTENZIONE/);
  });

  it('empty group or a post of another customer: nothing scheduled', async () => {
    const empty = setup({ posts: [] });
    expect((await empty.scheduler.scheduleApproved(INPUT, NOW)).status).toBe('FAILED');
    expect(empty.repo.createActivity.mock.calls[0][0].visibility).toBe('INTERNAL');

    const foreign = setup({
      posts: [
        post('ig-1', 'DRAFT'),
        post('fb-1', 'DRAFT', {
          integration: { customerId: 'customer-2', name: 'x', providerIdentifier: 'facebook' },
        }),
      ],
    });
    expect((await foreign.scheduler.scheduleApproved(INPUT, NOW)).status).toBe('FAILED');
    expect(foreign.postiz.schedulePost).not.toHaveBeenCalled();
  });

  it('idempotent: a second call finds the posts already queued and does nothing', async () => {
    const { scheduler, postiz, repo } = setup();
    await scheduler.scheduleApproved(INPUT, NOW);
    const second = await scheduler.scheduleApproved(INPUT, NOW);
    expect(second.status).toBe('NOTHING_TO_DO');
    expect(postiz.schedulePost).toHaveBeenCalledTimes(2); // ig + fb, once each
    expect(repo.createActivity).toHaveBeenCalledTimes(1);
  });

  it('never throws, even when writing the activity fails', async () => {
    const { scheduler, postiz, repo } = setup();
    postiz.assertSchedulerReachable.mockRejectedValue(new Error('down'));
    repo.createActivity.mockRejectedValue(new Error('activity insert failed'));
    await expect(scheduler.scheduleApproved(INPUT, NOW)).resolves.toMatchObject({ status: 'FAILED' });
  });
});

describe('unscheduling a reopened slot', () => {
  it('QUEUE roots go back to DRAFT through the native path; PUBLISHED / ERROR / DRAFT untouched', async () => {
    const { scheduler, postiz, repo, state } = setup({
      posts: [post('ig-1', 'QUEUE'), post('fb-1', 'PUBLISHED'), post('fb-2', 'ERROR'), post('fb-3', 'DRAFT')],
    });
    const result = await scheduler.unscheduleReopened(INPUT);
    expect(result.status).toBe('UNSCHEDULED');
    expect(postiz.unschedulePost.mock.calls.map((call) => call[1])).toEqual(['ig-1']);
    expect(state()).toEqual({ 'ig-1': 'DRAFT', 'fb-1': 'PUBLISHED', 'fb-2': 'ERROR', 'fb-3': 'DRAFT' });
    expect(repo.createActivity).not.toHaveBeenCalled();
  });

  it('nothing queued: nothing to do', async () => {
    const { scheduler, postiz } = setup({ posts: [post('ig-1', 'PUBLISHED')] });
    expect((await scheduler.unscheduleReopened(INPUT)).status).toBe('NOTHING_TO_DO');
    expect(postiz.unschedulePost).not.toHaveBeenCalled();
  });

  it('a workflow still running after the change is reported to the agency', async () => {
    const { scheduler, repo } = setup({ posts: [post('ig-1', 'QUEUE')], running: () => true });
    const result = await scheduler.unscheduleReopened(INPUT);
    expect(result.status).toBe('FAILED');
    expect(repo.createActivity.mock.calls[0][0]).toMatchObject({ type: 'OTHER', visibility: 'INTERNAL' });
    expect(repo.createActivity.mock.calls[0][0].title).toMatch(/^Riaperto ma ancora programmato/);
  });

  it('never throws', async () => {
    const { scheduler, postiz } = setup({ posts: [post('ig-1', 'QUEUE')] });
    postiz.unschedulePost.mockRejectedValue(new Error('db down'));
    await expect(scheduler.unscheduleReopened(INPUT)).resolves.toMatchObject({ status: 'FAILED' });
  });
});
