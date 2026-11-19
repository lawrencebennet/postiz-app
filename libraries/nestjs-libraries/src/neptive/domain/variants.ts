// Post variants (A, B, C...) for one PED slot. Pure rules, no I/O, shared by the
// services, the publish gate and the jest specs.
//
// Vocabulary: a "slot" is a NeptiveEditorialPlanItem. A "variant" is a
// NeptivePlanItemVariant row = one whole Postiz post group proposed for the slot.
// (Not to be confused with NeptiveContentProjection.variants, which are the
// per-channel renderings of ONE post group.)

export type VariantClientState =
  | 'IN_PREPARATION'
  | 'TO_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'REJECTED'
  | 'CONFIRMED'
  | 'NOT_CHOSEN';

export type VariantRowLike = {
  id: string;
  label: string;
  position: number;
  removedAt?: Date | string | null;
  createdAt?: Date | string;
};

export type SlotLike = {
  confirmedVariantId?: string | null;
  deletedAt?: Date | string | null;
};

/** A, B, ..., Z, AA, AB, ... for a zero-based index. */
export function variantLetter(index: number): string {
  let n = Math.max(0, Math.floor(index));
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * Next label for a new variant. Labels are never reused inside a slot, removed
 * rows included, so "variante B" in an old comment always means the same content.
 */
export function nextVariantLabel(existing: Array<{ label: string }>): string {
  const used = new Set(existing.map((row) => row.label.trim().toUpperCase()));
  for (let index = 0; index < 702; index++) {
    const letter = variantLetter(index);
    if (!used.has(letter)) {
      return letter;
    }
  }
  return `V${existing.length + 1}`;
}

export function sortVariants<T extends VariantRowLike>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
}

export function liveVariants<T extends VariantRowLike>(rows: T[]): T[] {
  return sortVariants(rows.filter((row) => !row.removedAt));
}

/**
 * What the client sees on the switcher for one variant.
 * - slot confirmed with this variant -> CONFIRMED
 * - slot confirmed with another one   -> NOT_CHOSEN (read-only history)
 * - otherwise from the variant's own approval status
 */
export function variantClientState(input: {
  variantId: string;
  slot: SlotLike;
  approvalStatus?: string | null;
}): VariantClientState {
  const confirmed = input.slot.confirmedVariantId;
  if (confirmed) {
    return confirmed === input.variantId ? 'CONFIRMED' : 'NOT_CHOSEN';
  }
  switch (input.approvalStatus) {
    case 'PENDING_CLIENT_APPROVAL':
      return 'TO_REVIEW';
    case 'CHANGES_REQUESTED':
      return 'CHANGES_REQUESTED';
    case 'REJECTED':
      return 'REJECTED';
    case 'APPROVED':
      // only reachable for data written outside the services; never show it
      // as confirmed without the slot pointer
      return 'TO_REVIEW';
    default:
      return 'IN_PREPARATION';
  }
}

/** State of a legacy single-post item (no variant rows), as one implicit variant. */
export function legacyClientState(
  approvalStatus?: string | null
): VariantClientState {
  if (approvalStatus === 'APPROVED') return 'CONFIRMED';
  return variantClientState({
    variantId: 'legacy',
    slot: {},
    approvalStatus,
  });
}

// flat shape (not a discriminated union): the backend compiles without
// strictNullChecks, where union narrowing on `ok` does not work
export type VariantActionCheck = {
  ok: boolean;
  reason?: 'REMOVED' | 'SLOT_DELETED' | 'NOT_CHOSEN' | 'ALREADY_CONFIRMED';
};

/**
 * Server-side guard for any decision or comment on a variant's approval.
 * `kind` = 'decide' for approve / request changes / reject, 'comment' for comments.
 */
export function checkVariantAction(input: {
  variant: { id: string; removedAt?: Date | string | null };
  slot: SlotLike;
  kind: 'decide' | 'comment';
}): VariantActionCheck {
  if (input.variant.removedAt) return { ok: false, reason: 'REMOVED' };
  if (input.slot.deletedAt) return { ok: false, reason: 'SLOT_DELETED' };
  const confirmed = input.slot.confirmedVariantId;
  if (confirmed && confirmed !== input.variant.id) {
    return { ok: false, reason: 'NOT_CHOSEN' };
  }
  if (confirmed && input.kind === 'decide') {
    return { ok: false, reason: 'ALREADY_CONFIRMED' };
  }
  return { ok: true };
}

export const VARIANT_REFUSAL_MESSAGES: Record<string, string> = {
  REMOVED: 'This variant was removed from the slot',
  SLOT_DELETED: 'This plan item was removed',
  NOT_CHOSEN:
    'Another variant is confirmed for this slot: this one is read-only until the agency reopens the slot',
  ALREADY_CONFIRMED: 'This slot is already confirmed',
};

/**
 * Publish gate decision for ONE variant row (see publish-gate/variant-publish.gate.ts).
 * A post group that has ever been attached as a variant may be published only
 * while it is the live, confirmed variant of a live slot. Everything else is
 * blocked, including "no decision yet".
 */
export function variantMayPublish(input: {
  variant: { id: string; removedAt?: Date | string | null };
  slot: SlotLike | null | undefined;
}): boolean {
  if (input.variant.removedAt) return false;
  if (!input.slot || input.slot.deletedAt) return false;
  return input.slot.confirmedVariantId === input.variant.id;
}
