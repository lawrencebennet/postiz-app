import { pedReviewUpdate } from './ped-review';

describe('Neptive PED review metadata', () => {
  it('stores a client change request with actor, note, and timestamp', () => {
    const result = pedReviewUpdate('CHANGES_REQUESTED', 'Please move the Reel', 'client-1');

    expect(result).toEqual({
      changeRequestNote: 'Please move the Reel',
      changeRequestedByClientUserId: 'client-1',
      changeRequestedAt: expect.any(Date),
    });
  });

  it('does not overwrite change-request metadata on approval', () => {
    expect(pedReviewUpdate('APPROVED', undefined, 'client-1')).toEqual({
      approvedByClientUserId: 'client-1',
      approvedAt: expect.any(Date),
    });
  });
});
