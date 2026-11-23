jest.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.service', () => ({
  PostsService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/media/media.service', () => ({
  MediaService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
jest.mock('@gitroom/helpers/utils/posts.list.minify', () => ({ expandPostsList: (x: unknown) => x }));
jest.mock('nestjs-temporal-core', () => ({ TemporalService: class {} }));

import { WorkflowNotFoundError } from '@temporalio/common';
import { PostizAdapter } from './postiz.adapter';

function setup(raw: any) {
  const posts = {
    changePostStatus: jest.fn().mockResolvedValue({}),
    changeDate: jest.fn().mockResolvedValue({}),
  };
  const temporal = { client: { getRawClient: () => raw } };
  const adapter = new PostizAdapter({} as any, posts as any, {} as any, {} as any, temporal as any);
  return { adapter, posts };
}

const rawWith = (describe: () => Promise<any>, systemInfo: () => Promise<any> = async () => ({})) => ({
  workflow: { getHandle: jest.fn(() => ({ describe: jest.fn(describe) })) },
  workflowService: { getSystemInfo: jest.fn(systemInfo) },
});

describe('PostizAdapter scheduling bridge', () => {
  it('schedules / unschedules through PostsService.changePostStatus', async () => {
    const { adapter, posts } = setup(rawWith(async () => ({})));
    await adapter.schedulePost('org-1', 'p1');
    await adapter.unschedulePost('org-1', 'p1');
    expect(posts.changePostStatus.mock.calls).toEqual([
      ['org-1', 'p1', 'schedule'],
      ['org-1', 'p1', 'draft'],
    ]);
  });

  it('moves a date through PostsService.changeDate without changing the state', async () => {
    const { adapter, posts } = setup(rawWith(async () => ({})));
    await adapter.movePublishDate('org-1', 'p1', new Date('2026-11-24T09:00:00.000Z'));
    expect(posts.changeDate).toHaveBeenCalledWith('org-1', 'p1', '2026-11-24T09:00:00.000Z', 'update');
  });

  it('postWorkflowRunning reads workflow post_<id>', async () => {
    const raw = rawWith(async () => ({ status: { name: 'RUNNING' } }));
    const { adapter } = setup(raw);
    expect(await adapter.postWorkflowRunning('p1')).toBe(true);
    expect(raw.workflow.getHandle).toHaveBeenCalledWith('post_p1');

    const done = setup(rawWith(async () => ({ status: { name: 'TERMINATED' } })));
    expect(await done.adapter.postWorkflowRunning('p1')).toBe(false);

    const missing = setup(
      rawWith(async () => {
        throw new WorkflowNotFoundError('not found', 'post_p1', undefined);
      })
    );
    expect(await missing.adapter.postWorkflowRunning('p1')).toBe(false);
  });

  it('postWorkflowRunning throws when it cannot tell (no client, error, timeout)', async () => {
    await expect(setup(null).adapter.postWorkflowRunning('p1')).rejects.toThrow();
    await expect(
      setup(
        rawWith(async () => {
          throw new Error('UNAVAILABLE');
        })
      ).adapter.postWorkflowRunning('p1')
    ).rejects.toThrow('UNAVAILABLE');
    jest.useFakeTimers();
    try {
      const pending = setup(rawWith(() => new Promise(() => undefined))).adapter.postWorkflowRunning('p1');
      const assertion = expect(pending).rejects.toThrow(/timeout/i);
      await jest.advanceTimersByTimeAsync(20_000);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  it('assertSchedulerReachable fails on no client, error or timeout', async () => {
    await expect(setup(rawWith(async () => ({}))).adapter.assertSchedulerReachable()).resolves.toBeUndefined();
    await expect(setup(null).adapter.assertSchedulerReachable()).rejects.toThrow();
    await expect(
      setup(
        rawWith(
          async () => ({}),
          async () => {
            throw new Error('ECONNREFUSED');
          }
        )
      ).adapter.assertSchedulerReachable()
    ).rejects.toThrow('ECONNREFUSED');
    jest.useFakeTimers();
    try {
      const pending = setup(rawWith(async () => ({}), () => new Promise(() => undefined))).adapter.assertSchedulerReachable();
      const assertion = expect(pending).rejects.toThrow(/timeout/i);
      await jest.advanceTimersByTimeAsync(20_000);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });
});
