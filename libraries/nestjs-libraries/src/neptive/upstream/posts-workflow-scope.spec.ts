// Upstream PostsService.startWorkflow / deletePost terminate the workflows found by the
// visibility query `postId="<id>"`. postId is a TEXT search attribute, so on Elasticsearch
// visibility that query is a full-text match: any shared hyphen token of two ids matches
// (verified on the local Temporal). These specs drive the real methods against a fake
// Temporal client that reproduces that matching, see neptive/UPSTREAM-SYNC.md.
jest.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.repository', () => ({ PostsRepository: class {} }));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({ IntegrationManager: class {} }));
jest.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/media/media.service', () => ({ MediaService: class {} }));
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({ ShortLinkService: class {} }));
jest.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({ OpenaiService: class {} }));
jest.mock('@gitroom/nestjs-libraries/integrations/refresh.integration.service', () => ({
  RefreshIntegrationService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/integrations/social.abstract', () => ({ RefreshToken: class {} }));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({ ioRedis: {} }));
jest.mock('@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher', () => ({ getSsrfSafeAxios: () => ({}) }));
jest.mock('@gitroom/helpers/utils/posts.list.minify', () => ({ minifyPostsList: (x: unknown) => x, minifyPosts: (x: unknown) => x }));
jest.mock('@sentry/nestjs', () => ({}));
jest.mock('isomorphic-dompurify', () => ({ __esModule: true, default: { sanitize: (x: string) => x, addHook: () => undefined } }));
jest.mock('sharp', () => () => ({}));
jest.mock('nestjs-temporal-core', () => ({ TemporalService: class {} }));

import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';

// hidden = started a moment ago, not in the visibility index yet
type Run = { workflowId: string; postId: string; running: boolean; hidden?: boolean };

/** Temporal with TEXT-attribute visibility: postId="x" matches any run sharing a token with x. */
function fakeTemporal(initial: Run[] = []) {
  const runs: Run[] = initial.map((run) => ({ ...run }));
  const tokens = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const current = (workflowId: string) => runs.filter((run) => run.workflowId === workflowId).pop();
  const raw = {
    workflow: {
      list: ({ query }: { query: string }) => {
        const wanted = tokens(/postId="([^"]+)"/.exec(query)![1]);
        const onlyRunning = /ExecutionStatus="Running"/.test(query);
        const hits = runs.filter(
          (run) =>
            !run.hidden && (!onlyRunning || run.running) && tokens(run.postId).some((token) => wanted.includes(token))
        );
        return (async function* () {
          for (const run of hits) yield { workflowId: run.workflowId };
        })();
      },
      start: jest.fn(async (_type: string, options: any) => {
        const existing = current(options.workflowId);
        if (existing?.running && options.workflowIdConflictPolicy === 'TERMINATE_EXISTING') existing.running = false;
        runs.push({ workflowId: options.workflowId, postId: options.args[0].postId, running: true });
      }),
    },
  };
  const client = {
    getRawClient: () => raw,
    getWorkflowHandle: async (workflowId: string) => ({
      describe: async () => ({ status: { name: current(workflowId)?.running ? 'RUNNING' : 'TERMINATED' } }),
      terminate: async () => {
        const run = current(workflowId);
        if (run) run.running = false;
      },
    }),
  };
  const running = (workflowId: string) => !!current(workflowId)?.running;
  return { temporal: { client }, runs, running };
}

function service(temporal: any, repository: any = {}) {
  return new PostsService(
    repository,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    temporal,
    {} as any
  );
}

// share the segments "4000" and "8000" (and a random uuid v4 shares "4xxx" with probability 1/4096)
const A = '5eed1000-0000-4000-8000-00000000000a';
const B = 'fb1d2e3f-4c5b-4000-8000-8d9e0f1a2b3c';
const C = '5eed1000-0000-4000-8000-00000000000c';

describe('PostsService workflow termination is scoped to the post (upstream divergence)', () => {
  it('the fake reproduces the fuzzy match: postId of B lists the run of A', async () => {
    const { temporal } = fakeTemporal([{ workflowId: `post_${A}`, postId: A, running: true }]);
    const listed = [];
    for await (const run of temporal.client.getRawClient().workflow.list({ query: `postId="${B}" AND ExecutionStatus="Running"` })) {
      listed.push(run.workflowId);
    }
    expect(listed).toEqual([`post_${A}`]);
  });

  it('scheduling the second post of a group does not terminate the first one', async () => {
    const fake = fakeTemporal();
    const posts = service(fake.temporal);
    await posts.startWorkflow('instagram', A, 'org-1', 'QUEUE');
    await posts.startWorkflow('facebook', B, 'org-1', 'QUEUE');
    expect(fake.running(`post_${A}`)).toBe(true);
    expect(fake.running(`post_${B}`)).toBe(true);
  });

  it('a post back to DRAFT stops its own workflow and its repeat children only', async () => {
    const fake = fakeTemporal([
      { workflowId: `post_${A}`, postId: A, running: true },
      { workflowId: `post_${A}_k3j4h5g6f7`, postId: A, running: true },
      { workflowId: `post_${C}`, postId: C, running: true },
      { workflowId: `post_${C}_a1b2c3d4e5`, postId: C, running: true },
    ]);
    await service(fake.temporal).startWorkflow('instagram', A, 'org-1', 'DRAFT');
    expect(fake.running(`post_${A}`)).toBe(false);
    expect(fake.running(`post_${A}_k3j4h5g6f7`)).toBe(false);
    expect(fake.running(`post_${C}`)).toBe(true);
    expect(fake.running(`post_${C}_a1b2c3d4e5`)).toBe(true);
  });

  it('rescheduling a post still replaces its own running workflow', async () => {
    const fake = fakeTemporal([{ workflowId: `post_${A}`, postId: A, running: true }]);
    await service(fake.temporal).startWorkflow('instagram', A, 'org-1', 'QUEUE');
    expect(fake.runs.filter((run) => run.workflowId === `post_${A}` && run.running)).toHaveLength(1);
  });

  it('deleting a post terminates only that post\'s workflows', async () => {
    const fake = fakeTemporal([
      { workflowId: `post_${A}`, postId: A, running: true },
      { workflowId: `post_${C}`, postId: C, running: true },
    ]);
    const repository = {
      getPostsByGroup: jest.fn().mockResolvedValue([{ id: A, parentPostId: null }]),
      deletePost: jest.fn().mockResolvedValue({ id: A }),
    };
    await service(fake.temporal, repository).deletePost('org-1', 'group-a');
    expect(fake.running(`post_${A}`)).toBe(false);
    expect(fake.running(`post_${C}`)).toBe(true);
  });

  it('deleting a multi-channel group stops the workflows of EVERY root (and their repeat children)', async () => {
    const fake = fakeTemporal([
      { workflowId: `post_${A}`, postId: A, running: true },
      { workflowId: `post_${A}_k3j4h5g6f7`, postId: A, running: true },
      // the Facebook twin, scheduled a second ago: not listed by the visibility query yet
      { workflowId: `post_${B}`, postId: B, running: true, hidden: true },
      { workflowId: `post_${C}`, postId: C, running: true },
    ]);
    const repository = {
      getPostsByGroup: jest.fn().mockResolvedValue([
        { id: A, parentPostId: null },
        { id: B, parentPostId: null },
        { id: 'comment-of-a', parentPostId: A },
      ]),
      // upstream returns ONE root of the group
      deletePost: jest.fn().mockResolvedValue({ id: A }),
    };
    const result = await service(fake.temporal, repository).deletePost('org-1', 'group-ab');
    expect(result).toEqual({ id: A });
    expect(fake.running(`post_${A}`)).toBe(false);
    expect(fake.running(`post_${A}_k3j4h5g6f7`)).toBe(false);
    expect(fake.running(`post_${B}`)).toBe(false);
    expect(fake.running(`post_${C}`)).toBe(true);
  });
});

