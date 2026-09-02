jest.mock('@gitroom/nestjs-libraries/neptive/repositories/neptive.repository', () => ({
  NeptiveRepository: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/services/client.service', () => ({
  NeptiveClientService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/services/activity.service', () => ({
  NeptiveActivityService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter', () => ({
  PostizAdapter: class {},
}));

import { NeptiveApprovalService } from './approval.service';

describe('Neptive approval service', () => {
  it('does not change native Postiz publishing state when a client approves', async () => {
    const approval = {
      id: 'approval-1',
      orgId: 'org-1',
      customerId: 'customer-1',
      postGroup: 'group-1',
      title: 'Casa Pandora',
      status: 'PENDING_CLIENT_APPROVAL',
      submittedAt: new Date(),
      approvedAt: null,
      requestedChangesNote: null,
      rejectedNote: null,
      actions: [],
      comments: [],
    } as any;
    const repo = {
      approvalByIdUnscoped: jest.fn().mockResolvedValue(approval),
      approvalById: jest.fn().mockResolvedValue(approval),
      transitionApproval: jest.fn().mockResolvedValue({ count: 1 }),
      addApprovalAction: jest.fn().mockResolvedValue(undefined),
    };
    const clients = { assertCustomer: jest.fn().mockResolvedValue(undefined) };
    const activities = { system: jest.fn().mockResolvedValue(undefined) };
    const postiz = {
      postsByGroup: jest.fn().mockResolvedValue([]),
      groupPreview: jest.fn().mockReturnValue(null),
      changeGroupPublishAuthorization: jest.fn(),
    };
    const service = new NeptiveApprovalService(
      repo as any,
      clients as any,
      activities as any,
      postiz as any
    );

    await service.transition('org-1', 'customer-1', 'approval-1', {
      status: 'APPROVED',
    } as any, { type: 'CLIENT_USER', id: 'client-user-1', name: 'Cliente' });

    expect(postiz.changeGroupPublishAuthorization).not.toHaveBeenCalled();
    expect(activities.system).toHaveBeenCalledTimes(1);
    expect(activities.system.mock.calls[0][2].type).toBe('POST_APPROVED');
  });
});
