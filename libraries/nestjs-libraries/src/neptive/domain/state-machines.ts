export const NEPTIVE_APPROVAL_TRANSITIONS: Record<
  string,
  readonly string[]
> = {
  DRAFT: ['PENDING_INTERNAL_REVIEW'],
  PENDING_INTERNAL_REVIEW: [
    'PENDING_CLIENT_APPROVAL',
    'CHANGES_REQUESTED',
    'REJECTED',
  ],
  PENDING_CLIENT_APPROVAL: ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'],
  CHANGES_REQUESTED: ['PENDING_INTERNAL_REVIEW', 'DRAFT'],
  REJECTED: ['DRAFT', 'PENDING_INTERNAL_REVIEW'],
  APPROVED: [],
};

export function canTransitionApproval(
  from: string,
  to: string
): boolean {
  return (NEPTIVE_APPROVAL_TRANSITIONS[from] || []).includes(to);
}

export const NEPTIVE_PED_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ['INTERNAL_REVIEW'],
  INTERNAL_REVIEW: ['CLIENT_REVIEW', 'CHANGES_REQUESTED', 'DRAFT'],
  CLIENT_REVIEW: ['APPROVED', 'CHANGES_REQUESTED'],
  CHANGES_REQUESTED: ['INTERNAL_REVIEW', 'DRAFT'],
  APPROVED: ['ACTIVE'],
  ACTIVE: ['COMPLETED'],
  COMPLETED: [],
};

export function canTransitionPed(from: string, to: string): boolean {
  return (NEPTIVE_PED_TRANSITIONS[from] || []).includes(to);
}
