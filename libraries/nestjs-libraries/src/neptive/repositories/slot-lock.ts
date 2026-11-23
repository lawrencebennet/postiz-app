import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';

// Serializes, per PED slot (NeptiveEditorialPlanItem.id), the whole
// "decision transaction + Postiz scheduling" of an approval and the whole
// "reopen transaction + unscheduling" of a reopen, so the two cannot
// interleave (slot reopened with posts in QUEUE, or approved with posts left
// in DRAFT). No schema change: a Postgres transaction-scoped advisory lock
// (pg_advisory_xact_lock), held by an interactive transaction on a small
// dedicated Prisma pool for as long as the work runs. Released by Postgres on
// commit, rollback or a dropped connection, so it cannot leak.
//
// Dedicated pool: the work itself uses the main pool (PostsService, the
// repositories); holding the lock on a main-pool connection could starve it on
// a small server (Prisma's default pool is 2 x CPUs + 1). Not reentrant: never
// call run() for a slot from inside run() for the same slot.

type LockTx = {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
};
export type SlotLockClient = {
  $transaction: <T>(
    fn: (tx: LockTx) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ) => Promise<T>;
  $disconnect?: () => Promise<void>;
};

export const NEPTIVE_SLOT_LOCK_CLIENT = 'NEPTIVE_SLOT_LOCK_CLIENT';

/** First key of the two-int advisory lock: keeps Neptive's locks apart from anyone else's. */
const LOCK_NAMESPACE = 735_100;
/** Waiting for the lock / a connection, then the longest a locked job may run. */
const MAX_WAIT_MS = 30_000;
const TIMEOUT_MS = 120_000;

function defaultClient(): SlotLockClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require('@prisma/client');
  const url = process.env.DATABASE_URL;
  const datasourceUrl =
    url && !/[?&]connection_limit=/.test(url)
      ? `${url}${url.includes('?') ? '&' : '?'}connection_limit=3`
      : url;
  return new PrismaClient(datasourceUrl ? { datasourceUrl } : {});
}

@Injectable()
export class NeptiveSlotLock implements OnModuleDestroy {
  private readonly logger = new Logger('NeptiveSlotLock');
  private client?: SlotLockClient;

  constructor(
    @Optional()
    @Inject(NEPTIVE_SLOT_LOCK_CLIENT)
    private readonly clientFactory?: () => SlotLockClient
  ) {}

  private db() {
    if (!this.client) {
      this.client = (this.clientFactory || defaultClient)();
    }
    return this.client;
  }

  async run<T>(itemIds: Array<string | null | undefined>, work: () => Promise<T>): Promise<T> {
    // sorted: two jobs locking the same slots always take them in the same order
    const keys = Array.from(new Set(itemIds.filter(Boolean) as string[])).sort();
    if (!keys.length) {
      return work();
    }
    // flat shape: the backend compiles without strictNullChecks (no union narrowing)
    let outcome: { ok: boolean; value?: T; error?: unknown } | undefined;
    try {
      await this.db().$transaction(
        async (tx) => {
          for (const key of keys) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, hashtext(${`neptive-slot:${key}`}))`;
          }
          outcome = await work().then(
            (value) => ({ ok: true, value }),
            (error) => ({ ok: false, error })
          );
        },
        { maxWait: MAX_WAIT_MS, timeout: TIMEOUT_MS }
      );
    } catch (err) {
      if (!outcome) {
        // the lock could not be taken: nothing was done
        throw err;
      }
      // the work finished; only releasing the lock failed (it is released anyway)
      this.logger.error(
        `slot lock ${keys.join(',')} released with an error: ${err instanceof Error ? err.message : err}`
      );
    }
    if (!outcome.ok) {
      throw outcome.error;
    }
    return outcome.value as T;
  }

  async onModuleDestroy() {
    await this.client?.$disconnect?.();
  }
}
