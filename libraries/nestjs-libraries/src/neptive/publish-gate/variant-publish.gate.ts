// Publish gate for post variants. Runs inside the Temporal worker of the
// orchestrator, as an activity inbound interceptor registered in
// libraries/nestjs-libraries/src/temporal/temporal.module.ts.
//
// Why here: every social publish in Postiz goes through exactly three activities
// of PostActivity (apps/orchestrator/src/activities/post.activity.ts), the only
// code that calls a provider's post / postPending / comment:
//   postSocial(integration, posts)          - workflows <= v1.0.5
//   postSocialPending(integration, posts)   - workflows >= v1.0.6
//   postComment(postId, lastPostId, integration, posts)
// Whatever starts the workflow (create, reschedule, "post now", the missing-posts
// sweep, a repeat, an old workflow version still in flight), the provider call
// happens inside one of these activities, so checking here, against the database
// at the moment of publishing, holds regardless of Post.state or of what the
// scheduler did before. finalizePost only continues a postSocialPending that
// already passed this gate.
//
// Rule (domain/variants.ts variantMayPublish): a post group that has ever been
// attached as a variant (row in neptive_plan_item_variants, removed rows
// included) may be published only while it is the live, confirmed variant of a
// live plan item. Groups that were never attached as variants are untouched.
//
// When it blocks, it throws a non-retryable ApplicationFailure of type
// 'bad_body': every post workflow version treats that as "the platform rejected
// the post" -> Post.state = ERROR with this message, in-app notification, stop.
// No provider call, no retry.

import { ApplicationFailure } from '@temporalio/common';
import type { Context as ActivityContext } from '@temporalio/activity';
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  ActivityInterceptorsFactory,
  Next,
} from '@temporalio/worker';
import { variantMayPublish } from '@gitroom/nestjs-libraries/neptive/domain/variants';

/** Activity name -> index of the `posts` argument. */
export const NEPTIVE_GATED_ACTIVITIES: Record<string, number> = {
  postSocial: 1,
  postSocialPending: 1,
  postComment: 3,
};

export type GatePostRef = {
  id?: string;
  group?: string;
  organizationId?: string;
};

export type GateVariantRow = {
  id: string;
  orgId: string;
  postGroup: string;
  label: string;
  removedAt: Date | null;
  item: {
    title: string;
    confirmedVariantId: string | null;
    deletedAt: Date | null;
  } | null;
};

export interface VariantGateStore {
  postsByIds(
    ids: string[]
  ): Promise<Array<{ id: string; group: string; organizationId: string }>>;
  variantsByGroups(groups: string[]): Promise<GateVariantRow[]>;
}

export type GateBlock = {
  postId?: string;
  group?: string;
  label?: string;
  itemTitle?: string;
  reason: 'NOT_CONFIRMED' | 'UNRESOLVED';
};

export function postsFromActivityArgs(
  activityType: string,
  args: unknown[]
): GatePostRef[] | null {
  const index = NEPTIVE_GATED_ACTIVITIES[activityType];
  if (index === undefined) {
    return null;
  }
  const list = args?.[index];
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((post) => post && typeof post === 'object')
    .map((post: any) => ({
      id: typeof post.id === 'string' ? post.id : undefined,
      group: typeof post.group === 'string' ? post.group : undefined,
      organizationId:
        typeof post.organizationId === 'string'
          ? post.organizationId
          : undefined,
    }));
}

export async function evaluateVariantGate(
  store: VariantGateStore,
  refs: GatePostRef[]
): Promise<{ allowed: boolean; blocked: GateBlock[] }> {
  if (!refs.length) {
    return { allowed: true, blocked: [] };
  }
  // trust the database, not the workflow arguments, for group/org
  const ids = refs.map((ref) => ref.id).filter(Boolean) as string[];
  const fromDb = ids.length ? await store.postsByIds(ids) : [];
  const byId = new Map(fromDb.map((row) => [row.id, row]));
  const resolved = refs.map((ref) => {
    const row = ref.id ? byId.get(ref.id) : undefined;
    return {
      postId: ref.id,
      group: row?.group || ref.group,
      orgId: row?.organizationId || ref.organizationId,
    };
  });

  const blocked: GateBlock[] = [];
  for (const ref of resolved) {
    if (!ref.group) {
      // cannot tell which content this is: fail closed
      blocked.push({ postId: ref.postId, reason: 'UNRESOLVED' });
    }
  }

  const groups = Array.from(
    new Set(resolved.map((ref) => ref.group).filter(Boolean) as string[])
  );
  const variants = groups.length ? await store.variantsByGroups(groups) : [];

  for (const ref of resolved) {
    if (!ref.group) continue;
    const rows = variants.filter(
      (row) =>
        row.postGroup === ref.group && (!ref.orgId || row.orgId === ref.orgId)
    );
    if (!rows.length) {
      continue; // never attached as a variant: Postiz behaviour unchanged
    }
    const ok = rows.some((row) =>
      variantMayPublish({ variant: row, slot: row.item })
    );
    if (!ok) {
      const row = rows[0];
      blocked.push({
        postId: ref.postId,
        group: ref.group,
        label: row.label,
        itemTitle: row.item?.title,
        reason: 'NOT_CONFIRMED',
      });
    }
  }
  return { allowed: blocked.length === 0, blocked };
}

export function variantGateMessage(blocked: GateBlock[]): string {
  const first = blocked[0];
  if (first?.reason === 'NOT_CONFIRMED') {
    return `Neptive: not published. This post is variant ${first.label || '?'}${
      first.itemTitle ? ` of “${first.itemTitle}”` : ''
    } and it is not the variant confirmed by the client.`;
  }
  return 'Neptive: not published. The publish gate could not identify this post.';
}

export const NEPTIVE_GATE_FAILURE_TYPE = 'bad_body';

export async function assertVariantMayPublish(
  store: VariantGateStore,
  activityType: string,
  args: unknown[]
) {
  const refs = postsFromActivityArgs(activityType, args);
  if (refs === null) {
    return;
  }
  const { allowed, blocked } = await evaluateVariantGate(store, refs);
  if (!allowed) {
    throw ApplicationFailure.create({
      message: variantGateMessage(blocked),
      type: NEPTIVE_GATE_FAILURE_TYPE,
      nonRetryable: true,
      details: [{ neptiveVariantGate: blocked }],
    });
  }
}

export class NeptiveVariantGateInterceptor
  implements ActivityInboundCallsInterceptor
{
  constructor(
    private readonly activityType: string,
    private readonly store: () => VariantGateStore
  ) {}

  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, 'execute'>
  ): Promise<unknown> {
    if (NEPTIVE_GATED_ACTIVITIES[this.activityType] !== undefined) {
      // any error here (database down...) propagates and the provider is not
      // called: fail closed
      await assertVariantMayPublish(
        this.store(),
        this.activityType,
        input.args as unknown[]
      );
    }
    return next(input);
  }
}

let defaultStore: VariantGateStore | undefined;

/** Lazily opens a small dedicated Prisma pool, only on the first gated activity. */
export function prismaVariantGateStore(): VariantGateStore {
  if (defaultStore) {
    return defaultStore;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require('@prisma/client');
  const url = process.env.DATABASE_URL;
  const datasourceUrl =
    url && !/[?&]connection_limit=/.test(url)
      ? `${url}${url.includes('?') ? '&' : '?'}connection_limit=2`
      : url;
  const prisma = new PrismaClient(datasourceUrl ? { datasourceUrl } : {});
  defaultStore = {
    postsByIds: (ids) =>
      prisma.post.findMany({
        where: { id: { in: ids } },
        select: { id: true, group: true, organizationId: true },
      }),
    variantsByGroups: (groups) =>
      prisma.neptivePlanItemVariant.findMany({
        where: { postGroup: { in: groups } },
        select: {
          id: true,
          orgId: true,
          postGroup: true,
          label: true,
          removedAt: true,
          item: {
            select: { title: true, confirmedVariantId: true, deletedAt: true },
          },
        },
      }),
  };
  return defaultStore;
}

/** Worker option: `interceptors: { activity: neptiveActivityInterceptors() }`. */
export function neptiveActivityInterceptors(
  store: () => VariantGateStore = prismaVariantGateStore
): ActivityInterceptorsFactory[] {
  return [
    (ctx: ActivityContext) => ({
      inbound: new NeptiveVariantGateInterceptor(ctx.info.activityType, store),
    }),
  ];
}
