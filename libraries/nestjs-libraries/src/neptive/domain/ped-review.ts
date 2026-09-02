export function pedReviewUpdate(
  status: string,
  comment: string | undefined,
  clientUserId: string | undefined
): Record<string, string | Date | null> {
  if (status === 'CHANGES_REQUESTED') {
    return {
      changeRequestNote: comment?.trim() || '',
      changeRequestedByClientUserId: clientUserId || null,
      changeRequestedAt: new Date(),
    };
  }
  if (status === 'APPROVED') {
    return {
      approvedByClientUserId: clientUserId || null,
      approvedAt: new Date(),
    };
  }
  return {};
}
