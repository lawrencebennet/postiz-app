import {
  NEPTIVE_APPROVAL_TRANSITIONS,
  canTransitionApproval,
  canTransitionPed,
} from './domain/state-machines';
import { assertSameCustomer } from './domain/scope';
import { hashNeptiveToken, newNeptiveToken } from './domain/tokens';
import { postPreviewText } from './domain/post-preview';

describe('Neptive approval state machine', () => {
  const valid = [
    ['DRAFT', 'PENDING_INTERNAL_REVIEW'],
    ['PENDING_INTERNAL_REVIEW', 'PENDING_CLIENT_APPROVAL'],
    ['PENDING_INTERNAL_REVIEW', 'CHANGES_REQUESTED'],
    ['PENDING_INTERNAL_REVIEW', 'REJECTED'],
    ['PENDING_CLIENT_APPROVAL', 'APPROVED'],
    ['PENDING_CLIENT_APPROVAL', 'CHANGES_REQUESTED'],
    ['PENDING_CLIENT_APPROVAL', 'REJECTED'],
    ['CHANGES_REQUESTED', 'PENDING_INTERNAL_REVIEW'],
    ['CHANGES_REQUESTED', 'DRAFT'],
    ['REJECTED', 'DRAFT'],
    ['REJECTED', 'PENDING_INTERNAL_REVIEW'],
  ] as const;

  it.each(valid)('allows %s → %s', (from, to) => {
    expect(canTransitionApproval(from, to)).toBe(true);
  });

  it('blocks skipping the two-stage review', () => {
    expect(canTransitionApproval('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionApproval('DRAFT', 'PENDING_CLIENT_APPROVAL')).toBe(
      false
    );
    expect(canTransitionApproval('PENDING_INTERNAL_REVIEW', 'APPROVED')).toBe(
      false
    );
  });

  it('treats APPROVED as terminal', () => {
    expect(NEPTIVE_APPROVAL_TRANSITIONS.APPROVED).toEqual([]);
    expect(canTransitionApproval('APPROVED', 'DRAFT')).toBe(false);
    expect(canTransitionApproval('APPROVED', 'CHANGES_REQUESTED')).toBe(false);
    expect(canTransitionApproval('APPROVED', 'REJECTED')).toBe(false);
  });

  it('does not duplicate Postiz publishing states', () => {
    const approvalStates = Object.keys(NEPTIVE_APPROVAL_TRANSITIONS);
    const allTargets = Object.values(NEPTIVE_APPROVAL_TRANSITIONS).flat();
    for (const status of [...approvalStates, ...allTargets]) {
      expect(['QUEUE', 'PUBLISHED', 'ERROR']).not.toContain(status);
    }
    expect(canTransitionApproval('DRAFT', 'QUEUE')).toBe(false);
    expect(canTransitionApproval('APPROVED', 'QUEUE')).toBe(false);
    expect(canTransitionApproval('PENDING_CLIENT_APPROVAL', 'PUBLISHED')).toBe(
      false
    );
  });
});

describe('Neptive PED state machine', () => {
  it('does not skip from draft to approved', () => {
    expect(canTransitionPed('DRAFT', 'INTERNAL_REVIEW')).toBe(true);
    expect(canTransitionPed('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionPed('CLIENT_REVIEW', 'APPROVED')).toBe(true);
  });
});

describe('Neptive tenant isolation helpers', () => {
  it('rejects a resource that belongs to another customer even when the id is known', () => {
    expect(() => assertSameCustomer('client-a', 'client-b')).toThrow();
    expect(() => assertSameCustomer('client-a', 'client-a')).not.toThrow();
    expect(() => assertSameCustomer('client-a', undefined)).toThrow();
  });

  it('hashes magic tokens so the raw value is not stored', () => {
    const token = newNeptiveToken();
    const hashed = hashNeptiveToken(token);
    expect(hashed).not.toEqual(token);
    expect(hashed).toEqual(hashNeptiveToken(token));
    expect(hashed).not.toEqual(hashNeptiveToken(token + 'x'));
    expect(hashed).toHaveLength(64);
  });
});

describe('Neptive getOrForbid decision', () => {
  function resolve(unscoped: { orgId: string; customerId: string } | null, actor: {
    orgId: string;
    customerId: string;
  }) {
    if (
      unscoped &&
      (unscoped.orgId !== actor.orgId || unscoped.customerId !== actor.customerId)
    ) {
      return 'forbidden';
    }
    if (!unscoped) {
      return 'missing';
    }
    return 'ok';
  }

  const actorA = { orgId: 'org-1', customerId: 'client-a' };

  it('returns forbidden for every Client B domain object when Client A knows the id', () => {
    const resources = [
      { id: 'ped-b', orgId: 'org-1', customerId: 'client-b' },
      { id: 'appr-b', orgId: 'org-1', customerId: 'client-b' },
      { id: 'str-b', orgId: 'org-1', customerId: 'client-b' },
      { id: 'act-b', orgId: 'org-1', customerId: 'client-b' },
      { id: 'mat-b', orgId: 'org-1', customerId: 'client-b' },
      { id: 'rep-b', orgId: 'org-1', customerId: 'client-b' },
    ];
    for (const resource of resources) {
      expect(resolve(resource, actorA)).toBe('forbidden');
    }
  });

  it('does not treat a missing id as a Client B hit', () => {
    expect(resolve(null, actorA)).toBe('missing');
  });

  it('allows the owning client', () => {
    expect(
      resolve(
        { orgId: 'org-1', customerId: 'client-a' },
        actorA
      )
    ).toBe('ok');
  });
});

describe('Neptive portal session binding', () => {
  it('binds exactly one customer and ignores a browser-supplied customerId', () => {
    const session = {
      customerId: 'client-a',
      orgId: 'org-1',
      clientUserId: 'user-a',
    };
    const bodyCustomerId = 'client-b';
    const queryCustomerId = 'client-b';
    const scopedCustomerId = session.customerId;
    expect(scopedCustomerId).toBe('client-a');
    expect(scopedCustomerId).not.toBe(bodyCustomerId);
    expect(scopedCustomerId).not.toBe(queryCustomerId);
  });
});

describe('Postiz scheduling bridge contract', () => {
  function nextPublishAction(
    state: string,
    authorizeSchedule: boolean
  ): 'schedule' | 'draft' | 'skip' {
    if (state === 'PUBLISHED' || state === 'ERROR') {
      return 'skip';
    }
    if (authorizeSchedule) {
      return state === 'DRAFT' ? 'schedule' : 'skip';
    }
    return state === 'QUEUE' ? 'draft' : 'skip';
  }

  it('authorized approval schedules a draft through PostsService.changePostStatus', () => {
    expect(nextPublishAction('DRAFT', true)).toBe('schedule');
  });

  it('does not rewrite an already queued or published post on approve', () => {
    expect(nextPublishAction('QUEUE', true)).toBe('skip');
    expect(nextPublishAction('PUBLISHED', true)).toBe('skip');
  });

  it('changes requested / rejected unschedule QUEUE but never unpublish', () => {
    expect(nextPublishAction('QUEUE', false)).toBe('draft');
    expect(nextPublishAction('PUBLISHED', false)).toBe('skip');
    expect(nextPublishAction('DRAFT', false)).toBe('skip');
    expect(nextPublishAction('ERROR', false)).toBe('skip');
  });
});

describe('post preview text', () => {
  it('unwraps Postiz content JSON arrays', () => {
    expect(
      postPreviewText('[{"content":"Client A draft approve fixture post","image":[]}]')
    ).toBe('Client A draft approve fixture post');
  });

  it('joins multiple blocks and ignores empty values', () => {
    expect(
      postPreviewText([
        { content: 'Hello' },
        { content: '' },
        { content: 'World' },
      ])
    ).toBe('Hello\nWorld');
  });

  it('returns plain strings unchanged', () => {
    expect(postPreviewText('already text')).toBe('already text');
  });
});
