import { ApplicationFailure } from '@temporalio/common';
import {
  NeptiveVariantGateInterceptor,
  evaluateVariantGate,
  neptiveActivityInterceptors,
  postsFromActivityArgs,
  type GateVariantRow,
  type VariantGateStore,
} from './variant-publish.gate';

const ORG = 'org-1';

function store(
  posts: Array<{ id: string; group: string; organizationId: string }>,
  variants: GateVariantRow[]
): VariantGateStore & { calls: number } {
  const s = {
    calls: 0,
    postsByIds: jest.fn(async (ids: string[]) => {
      s.calls++;
      return posts.filter((post) => ids.includes(post.id));
    }),
    variantsByGroups: jest.fn(async (groups: string[]) => {
      s.calls++;
      return variants.filter((row) => groups.includes(row.postGroup));
    }),
  };
  return s;
}

const variant = (
  id: string,
  postGroup: string,
  label: string,
  confirmedVariantId: string | null,
  extra: Partial<GateVariantRow> = {},
  itemExtra: Partial<NonNullable<GateVariantRow['item']>> = {}
): GateVariantRow => ({
  id,
  orgId: ORG,
  postGroup,
  label,
  removedAt: null,
  item: { title: 'Reel New Life', confirmedVariantId, deletedAt: null, ...itemExtra },
  ...extra,
});

const POSTS = [
  { id: 'p-legacy', group: 'g-legacy', organizationId: ORG },
  { id: 'p-a', group: 'g-a', organizationId: ORG },
  { id: 'p-b', group: 'g-b', organizationId: ORG },
  { id: 'p-c', group: 'g-c', organizationId: ORG },
];

describe('publish gate: decision', () => {
  it('leaves posts that were never variants untouched (existing queue keeps its behaviour)', async () => {
    const s = store(POSTS, [variant('va', 'g-a', 'A', null)]);
    const result = await evaluateVariantGate(s, [{ id: 'p-legacy', group: 'g-legacy' }]);
    expect(result).toEqual({ allowed: true, blocked: [] });
  });

  it('blocks every variant while the slot has no decision', async () => {
    const s = store(POSTS, [variant('va', 'g-a', 'A', null), variant('vb', 'g-b', 'B', null)]);
    expect((await evaluateVariantGate(s, [{ id: 'p-a' }])).allowed).toBe(false);
    expect((await evaluateVariantGate(s, [{ id: 'p-b' }])).allowed).toBe(false);
  });

  it('lets only the confirmed variant through', async () => {
    const rows = [variant('va', 'g-a', 'A', 'vb'), variant('vb', 'g-b', 'B', 'vb')];
    const s = store(POSTS, rows);
    expect((await evaluateVariantGate(s, [{ id: 'p-b' }])).allowed).toBe(true);
    const blocked = await evaluateVariantGate(s, [{ id: 'p-a' }]);
    expect(blocked.allowed).toBe(false);
    expect(blocked.blocked[0]).toMatchObject({ label: 'A', reason: 'NOT_CONFIRMED' });
  });

  it('keeps removed variants and variants of deleted items blocked', async () => {
    const s = store(POSTS, [
      variant('vc', 'g-c', 'C', null, { removedAt: new Date() }),
      variant('va', 'g-a', 'A', 'va', {}, { deletedAt: new Date() }),
    ]);
    expect((await evaluateVariantGate(s, [{ id: 'p-c' }])).allowed).toBe(false);
    expect((await evaluateVariantGate(s, [{ id: 'p-a' }])).allowed).toBe(false);
  });

  it('reads the group from the database, not from the workflow arguments', async () => {
    const s = store(POSTS, [variant('va', 'g-a', 'A', null)]);
    // argument claims a harmless group, the database row says g-a
    const result = await evaluateVariantGate(s, [{ id: 'p-a', group: 'g-legacy' }]);
    expect(result.allowed).toBe(false);
  });

  it('a variant row of another organisation does not affect this post', async () => {
    const s = store(POSTS, [variant('vx', 'g-legacy', 'A', null, { orgId: 'org-2' })]);
    expect((await evaluateVariantGate(s, [{ id: 'p-legacy' }])).allowed).toBe(true);
  });

  it('fails closed when it cannot tell which post this is', async () => {
    const s = store([], []);
    const result = await evaluateVariantGate(s, [{ id: 'unknown-id' }]);
    expect(result.allowed).toBe(false);
    expect(result.blocked[0].reason).toBe('UNRESOLVED');
  });

  it('extracts the posts argument of each publishing activity', () => {
    const posts = [{ id: 'p-a', group: 'g-a' }];
    expect(postsFromActivityArgs('postSocialPending', [{}, posts])).toHaveLength(1);
    expect(postsFromActivityArgs('postSocial', [{}, posts])).toHaveLength(1);
    expect(postsFromActivityArgs('postComment', ['x', undefined, {}, posts])).toHaveLength(1);
    expect(postsFromActivityArgs('getPost', ['org', 'p-a'])).toBeNull();
  });
});

describe('publish gate: worker interceptor', () => {
  const blockedStore = () => store(POSTS, [variant('va', 'g-a', 'A', 'vb'), variant('vb', 'g-b', 'B', 'vb')]);

  it('refuses the provider call for an unconfirmed variant with a non-retryable bad_body failure', async () => {
    const s = blockedStore();
    const next = jest.fn().mockResolvedValue('PUBLISHED');
    const interceptor = new NeptiveVariantGateInterceptor('postSocialPending', () => s);
    let error: unknown;
    try {
      await interceptor.execute({ args: [{ id: 'integration' }, [{ id: 'p-a', group: 'g-a' }]], headers: {} }, next);
    } catch (err) {
      error = err;
    }
    expect(next).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(ApplicationFailure);
    expect((error as ApplicationFailure).type).toBe('bad_body');
    expect((error as ApplicationFailure).nonRetryable).toBe(true);
    expect((error as ApplicationFailure).message).toContain('variant A');
  });

  it('also covers comments and the old postSocial activity', async () => {
    const s = blockedStore();
    const next = jest.fn();
    await expect(
      new NeptiveVariantGateInterceptor('postComment', () => s).execute(
        { args: ['remote-id', undefined, {}, [{ id: 'p-a' }]], headers: {} },
        next
      )
    ).rejects.toBeInstanceOf(ApplicationFailure);
    await expect(
      new NeptiveVariantGateInterceptor('postSocial', () => s).execute(
        { args: [{}, [{ id: 'p-a' }]], headers: {} },
        next
      )
    ).rejects.toBeInstanceOf(ApplicationFailure);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets the confirmed variant and ordinary posts publish unchanged', async () => {
    const s = blockedStore();
    const next = jest.fn().mockResolvedValue('PUBLISHED');
    const input = { args: [{}, [{ id: 'p-b' }]], headers: {} };
    await expect(
      new NeptiveVariantGateInterceptor('postSocialPending', () => s).execute(input, next)
    ).resolves.toBe('PUBLISHED');
    await expect(
      new NeptiveVariantGateInterceptor('postSocialPending', () => s).execute(
        { args: [{}, [{ id: 'p-legacy' }]], headers: {} },
        next
      )
    ).resolves.toBe('PUBLISHED');
    expect(next).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledWith(input);
  });

  it('does not touch the database for activities that do not publish', async () => {
    const s = blockedStore();
    const next = jest.fn().mockResolvedValue('ok');
    await new NeptiveVariantGateInterceptor('getPostsList', () => s).execute(
      { args: ['org', 'p-a'], headers: {} },
      next
    );
    expect(s.calls).toBe(0);
    expect(next).toHaveBeenCalled();
  });

  it('fails closed when the gate cannot read the database', async () => {
    const broken: VariantGateStore = {
      postsByIds: jest.fn().mockRejectedValue(new Error('db down')),
      variantsByGroups: jest.fn(),
    };
    const next = jest.fn();
    await expect(
      new NeptiveVariantGateInterceptor('postSocialPending', () => broken).execute(
        { args: [{}, [{ id: 'p-legacy' }]], headers: {} },
        next
      )
    ).rejects.toThrow('db down');
    expect(next).not.toHaveBeenCalled();
  });

  it('is exposed as a worker activity interceptor factory', () => {
    const [factory] = neptiveActivityInterceptors(() => blockedStore());
    const interceptors = factory({ info: { activityType: 'postSocialPending' } } as any);
    expect(interceptors.inbound).toBeInstanceOf(NeptiveVariantGateInterceptor);
  });
});
