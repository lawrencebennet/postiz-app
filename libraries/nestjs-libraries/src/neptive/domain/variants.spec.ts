import {
  checkVariantAction,
  legacyClientState,
  liveVariants,
  nextVariantLabel,
  variantClientState,
  variantLetter,
  variantMayPublish,
} from './variants';

describe('variant labels', () => {
  it('runs A..Z then AA', () => {
    expect([0, 1, 25, 26, 27].map(variantLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
  });

  it('never reuses a label, removed rows included', () => {
    expect(nextVariantLabel([])).toBe('A');
    expect(nextVariantLabel([{ label: 'A' }, { label: 'B' }])).toBe('C');
    // B was removed but its row still exists: next is C, not B
    expect(nextVariantLabel([{ label: 'A' }, { label: 'B' }])).not.toBe('B');
    expect(nextVariantLabel([{ label: 'a' }])).toBe('B');
  });

  it('orders live variants by position', () => {
    const rows = [
      { id: '2', label: 'B', position: 1 },
      { id: '1', label: 'A', position: 0 },
      { id: '3', label: 'C', position: 2, removedAt: new Date() },
    ];
    expect(liveVariants(rows).map((row) => row.label)).toEqual(['A', 'B']);
  });
});

describe('variant client state', () => {
  it('maps the approval status while the slot is open', () => {
    const at = (approvalStatus?: string | null) =>
      variantClientState({ variantId: 'v1', slot: {}, approvalStatus });
    expect(at('PENDING_CLIENT_APPROVAL')).toBe('TO_REVIEW');
    expect(at('CHANGES_REQUESTED')).toBe('CHANGES_REQUESTED');
    expect(at('REJECTED')).toBe('REJECTED');
    expect(at('DRAFT')).toBe('IN_PREPARATION');
    expect(at(undefined)).toBe('IN_PREPARATION');
    // APPROVED without the slot pointer is never shown as confirmed
    expect(at('APPROVED')).toBe('TO_REVIEW');
  });

  it('confirmed slot: one CONFIRMED, the rest NOT_CHOSEN whatever their approval', () => {
    const slot = { confirmedVariantId: 'v2' };
    expect(variantClientState({ variantId: 'v2', slot, approvalStatus: 'APPROVED' })).toBe('CONFIRMED');
    expect(
      variantClientState({ variantId: 'v1', slot, approvalStatus: 'PENDING_CLIENT_APPROVAL' })
    ).toBe('NOT_CHOSEN');
    expect(
      variantClientState({ variantId: 'v3', slot, approvalStatus: 'CHANGES_REQUESTED' })
    ).toBe('NOT_CHOSEN');
  });

  it('legacy single-post item: confirmed iff its approval is APPROVED (as before)', () => {
    expect(legacyClientState('APPROVED')).toBe('CONFIRMED');
    expect(legacyClientState('PENDING_CLIENT_APPROVAL')).toBe('TO_REVIEW');
    expect(legacyClientState(null)).toBe('IN_PREPARATION');
  });
});

describe('variant action guard', () => {
  const v1 = { id: 'v1' };
  it('allows decisions and comments while the slot is open', () => {
    expect(checkVariantAction({ variant: v1, slot: {}, kind: 'decide' }).ok).toBe(true);
    expect(checkVariantAction({ variant: v1, slot: {}, kind: 'comment' }).ok).toBe(true);
  });

  it('makes the variants that were not chosen read-only', () => {
    const slot = { confirmedVariantId: 'v2' };
    expect(checkVariantAction({ variant: v1, slot, kind: 'decide' })).toEqual({
      ok: false,
      reason: 'NOT_CHOSEN',
    });
    expect(checkVariantAction({ variant: v1, slot, kind: 'comment' }).reason).toBe('NOT_CHOSEN');
  });

  it('the confirmed variant still takes comments but no new decision', () => {
    const slot = { confirmedVariantId: 'v1' };
    expect(checkVariantAction({ variant: v1, slot, kind: 'comment' }).ok).toBe(true);
    expect(checkVariantAction({ variant: v1, slot, kind: 'decide' }).reason).toBe(
      'ALREADY_CONFIRMED'
    );
  });

  it('refuses removed variants and deleted slots', () => {
    expect(
      checkVariantAction({ variant: { id: 'v1', removedAt: new Date() }, slot: {}, kind: 'comment' }).reason
    ).toBe('REMOVED');
    expect(
      checkVariantAction({ variant: v1, slot: { deletedAt: new Date() }, kind: 'decide' }).reason
    ).toBe('SLOT_DELETED');
  });
});

describe('variant publish rule', () => {
  it('only the live confirmed variant of a live slot may publish', () => {
    expect(variantMayPublish({ variant: { id: 'v1' }, slot: { confirmedVariantId: 'v1' } })).toBe(true);
    expect(variantMayPublish({ variant: { id: 'v1' }, slot: { confirmedVariantId: 'v2' } })).toBe(false);
    expect(variantMayPublish({ variant: { id: 'v1' }, slot: { confirmedVariantId: null } })).toBe(false);
    expect(
      variantMayPublish({ variant: { id: 'v1', removedAt: new Date() }, slot: { confirmedVariantId: 'v1' } })
    ).toBe(false);
    expect(
      variantMayPublish({ variant: { id: 'v1' }, slot: { confirmedVariantId: 'v1', deletedAt: new Date() } })
    ).toBe(false);
    expect(variantMayPublish({ variant: { id: 'v1' }, slot: null })).toBe(false);
  });
});
