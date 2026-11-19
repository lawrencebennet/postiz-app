// Real-runtime check of the variant publish gate (LOCAL ONLY, publishes nothing).
//
// Runs the real Postiz post workflow (apps/orchestrator/.../post.workflow.v1.1.2.ts,
// the version startWorkflow uses today) on the local Temporal server, on a private
// task queue, with a Worker configured with the same activity interceptors the
// orchestrator gets from temporal.module.ts. Every activity is a fake that records
// its calls; `postSocialPending` (the activity that calls the provider) only
// records "PROVIDER CALLED". The gate itself is real: it reads the local database.
//
// usage: neptive/dev/gate-check.sh            (bundles this file + the workflow, runs it)
import { NativeConnection, Worker } from '@temporalio/worker';
import { Client, Connection } from '@temporalio/client';
import { PrismaClient } from '@prisma/client';
import { neptiveActivityInterceptors } from '@gitroom/nestjs-libraries/neptive/publish-gate/variant-publish.gate';

const ADDRESS = process.env.TEMPORAL_ADDRESS || '127.0.0.1:57233';
const WORKFLOWS = process.argv[2];
const prisma = new PrismaClient();

type Call = { activity: string; args: unknown[] };

async function runOne(postId: string, client: Client, taskQueue: string, calls: Call[]) {
  calls.length = 0;
  const handle = await client.workflow.start('postWorkflowV112', {
    taskQueue,
    workflowId: `neptive-gate-check-${postId}-${Date.now()}`,
    args: [{ taskQueue, postId, organizationId: 'd6d585e7-d225-4225-9f96-d8b595c53d72' }],
  });
  await handle.result();
  const providerCalled = calls.some((call) => call.activity === 'PROVIDER CALLED');
  const state = calls.filter((call) => call.activity === 'changeState').map((call) => call.args[1]);
  const error = calls
    .filter((call) => call.activity === 'changeState')
    .map((call) => {
      // the workflow passes the serialized ActivityFailure; keep the failure type and message
      const text = JSON.stringify(call.args[2] ?? '');
      const message = /Neptive:[^"\\]*/.exec(text)?.[0] || text.slice(0, 160);
      const type = /"type":"([a-z_]+)"/.exec(text)?.[1];
      const nonRetryable = /"nonRetryable":true/.test(text);
      return `${type || '?'}${nonRetryable ? ' (non-retryable)' : ''}: ${message}`;
    })
    .join(' | ');
  const notification = calls
    .filter((call) => call.activity === 'inAppNotification')
    .map((call) => String(call.args[1]))
    .join(' | ');
  const published = calls.some((call) => call.activity === 'updatePost');
  return { postId, providerCalled, published, state, error, notification, activities: calls.map((call) => call.activity) };
}

async function main() {
  const taskQueue = `neptive-gate-check-${Date.now()}`;
  const calls: Call[] = [];
  const record = (activity: string) => (...args: unknown[]) => {
    calls.push({ activity, args });
  };
  const loadPost = async (id: string) => {
    const post = await prisma.post.findUnique({ where: { id }, include: { integration: true } });
    if (!post) return false;
    return {
      ...post,
      // run now, whatever the stored date is; state is the real one
      publishDate: new Date(Date.now() - 60_000),
      settings: post.settings || '{}',
      integration: { ...post.integration, refreshNeeded: false, disabled: false, token: 'not-used' },
    };
  };

  const activities = {
    getPost: async (_org: string, id: string) => loadPost(id),
    getPostsList: async (_org: string, id: string) => {
      const post = await loadPost(id);
      return post ? [post] : [];
    },
    postSocialPending: async (_integration: unknown, posts: Array<{ id: string }>) => {
      calls.push({ activity: 'PROVIDER CALLED', args: [posts.map((post) => post.id)] });
      return [{ id: posts[0].id, postId: 'fake-remote-id', releaseURL: 'https://example.invalid/p', status: 'success' }];
    },
    postSocial: async () => {
      throw new Error('not used by v1.1.2');
    },
    postComment: async () => {
      calls.push({ activity: 'PROVIDER CALLED (comment)', args: [] });
      return [];
    },
    changeState: async (...args: unknown[]) => record('changeState')(...args),
    updatePost: async (...args: unknown[]) => record('updatePost')(...args),
    inAppNotification: async (...args: unknown[]) => record('inAppNotification')(...args),
    sendWebhooks: async (...args: unknown[]) => record('sendWebhooks')(...args),
    isCommentable: async () => false,
    internalPlugs: async () => [],
    globalPlugs: async () => [],
    processInternalPlug: async () => undefined,
    processPlug: async () => undefined,
    getIntegrationById: async () => null,
    refreshTokenWithCause: async () => null,
    checkPostStatus: async () => ({ status: 'completed' }),
    finalizePost: async () => ({ status: 'completed' }),
  };

  const connection = await NativeConnection.connect({ address: ADDRESS });
  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue,
    workflowsPath: WORKFLOWS,
    activities,
    // exactly what temporal.module.ts adds to the orchestrator workers
    interceptors: { activity: neptiveActivityInterceptors() },
  });
  const client = new Client({ connection: await Connection.connect({ address: ADDRESS }) });

  const ids = process.argv.slice(3);
  const results = await worker.runUntil(async () => {
    const out = [];
    for (const id of ids) out.push(await runOne(id, client, taskQueue, calls));
    return out;
  });
  for (const result of results) {
    console.log(JSON.stringify(result));
  }
  await prisma.$disconnect();
  await connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
