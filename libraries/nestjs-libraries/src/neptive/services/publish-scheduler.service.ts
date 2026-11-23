import { Injectable, Logger } from '@nestjs/common';
import { NeptiveRepository } from '@gitroom/nestjs-libraries/neptive/repositories/neptive.repository';
import { NeptiveVariantRepository } from '@gitroom/nestjs-libraries/neptive/repositories/variant.repository';
import { PostizAdapter } from '@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter';
import { variantMayPublish } from '@gitroom/nestjs-libraries/neptive/domain/variants';
import {
  nextPublishDate,
  romeDateTimeLabel,
} from '@gitroom/nestjs-libraries/neptive/domain/publish-date';

// Approval -> Postiz scheduling bridge.
//
// After a client (or agency) approval has been committed, the DRAFT root posts
// of the approved group are scheduled through the native Postiz path
// (PostsService.changePostStatus 'schedule' = state QUEUE + postWorkflowV112,
// workflowId post_<id>, TERMINATE_EXISTING). A reopen does the reverse for posts
// still in QUEUE.
//
// Fail closed. Postiz's own start swallows every Temporal error and leaves the
// post in QUEUE, so this bridge checks Temporal before touching anything and
// checks afterwards that a workflow is really running for every post. Any doubt
// puts every post of the group back to DRAFT and writes an agency-only activity.
// The approval itself is never undone: it is already committed when this runs.
// Nothing here throws.

type GroupInput = {
  orgId: string;
  customerId: string;
  postGroup: string;
  title?: string | null;
};

export type ScheduleOutcome = {
  status: 'SCHEDULED' | 'NOTHING_TO_DO' | 'SKIPPED' | 'FAILED' | 'UNSCHEDULED';
  reason?: string;
  postIds?: string[];
};

type GroupPost = {
  id: string;
  state: string;
  publishDate: Date;
  parentPostId?: string | null;
  integration?: { customerId?: string | null; name?: string; providerIdentifier?: string } | null;
};

const message = (err: unknown) =>
  (err instanceof Error ? err.message : String(err || 'errore sconosciuto')).slice(0, 500);

const channelOf = (post: GroupPost) =>
  [post.integration?.providerIdentifier, post.integration?.name]
    .filter(Boolean)
    .join(' · ') || post.id;

class SchedulingRefused extends Error {}

@Injectable()
export class NeptivePublishScheduler {
  private readonly logger = new Logger('NeptivePublishScheduler');

  constructor(
    private repo: NeptiveRepository,
    private variants: NeptiveVariantRepository,
    private postiz: PostizAdapter
  ) {}

  private async activity(
    input: GroupInput,
    data: { type: 'POST_SCHEDULED' | 'OTHER'; visibility: 'CLIENT_VISIBLE' | 'INTERNAL'; title: string; body: string }
  ) {
    try {
      await this.repo.createActivity({
        orgId: input.orgId,
        customerId: input.customerId,
        type: data.type,
        title: data.title.slice(0, 250),
        body: data.body,
        visibility: data.visibility,
        source: 'SYSTEM',
        relatedPostGroup: input.postGroup,
      });
    } catch (err) {
      this.logger.error(`activity for group ${input.postGroup} not written: ${message(err)}`);
    }
  }

  /** Is this group allowed to be scheduled right now? Same rule as the publish gate. */
  private async assertMayPublish(input: GroupInput) {
    const variant = await this.variants.variantByGroup(input.orgId, input.postGroup);
    if (variant) {
      if (variant.customerId !== input.customerId) {
        throw new SchedulingRefused('la variante appartiene a un altro cliente');
      }
      if (!variantMayPublish({ variant, slot: variant.item })) {
        throw new SchedulingRefused(
          `la variante ${variant.label} non risulta la variante confermata dello slot`
        );
      }
      return 'VARIANT' as const;
    }
    const items = await this.variants.liveItemsByGroup(input.orgId, input.postGroup);
    return items.length ? ('PED_ITEM' as const) : null;
  }

  private async loadRoots(input: GroupInput) {
    const posts = (await this.postiz.postsByGroup(input.orgId, input.postGroup)) as GroupPost[];
    if (!posts.length) {
      throw new SchedulingRefused('nessun post trovato per questo contenuto');
    }
    if (posts.some((post) => post.integration?.customerId !== input.customerId)) {
      throw new SchedulingRefused('il contenuto contiene post di un altro cliente');
    }
    // comments (parentPostId) are published by their root's workflow
    return posts.filter((post) => !post.parentPostId);
  }

  /** Puts every given post back to DRAFT; returns what could not be confirmed as stopped. */
  private async rollback(orgId: string, postIds: string[]) {
    const problems: string[] = [];
    for (const id of postIds) {
      try {
        await this.postiz.unschedulePost(orgId, id);
      } catch (err) {
        problems.push(`post ${id}: annullamento della programmazione non confermato (${message(err)})`);
        continue;
      }
      try {
        if (await this.postiz.postWorkflowRunning(id)) {
          problems.push(`post ${id}: il workflow di pubblicazione risulta ancora attivo`);
        }
      } catch (err) {
        problems.push(`post ${id}: impossibile verificare che il workflow sia fermo (${message(err)})`);
      }
    }
    return problems;
  }

  async scheduleApproved(input: GroupInput, now: Date = new Date()): Promise<ScheduleOutcome> {
    const title = input.title || 'contenuto';
    const touched: string[] = [];
    const moved: string[] = [];
    try {
      const kind = await this.assertMayPublish(input);
      if (!kind) {
        // an approval outside the PED: same as before, the agency schedules it
        return { status: 'SKIPPED' };
      }
      const roots = await this.loadRoots(input);
      const drafts = roots.filter((post) => post.state === 'DRAFT');
      if (!drafts.length) {
        return { status: 'NOTHING_TO_DO' };
      }

      // Temporal down -> stop before any post changes
      await this.postiz.assertSchedulerReachable();

      const lines: string[] = [];
      for (const post of drafts) {
        const planned = new Date(post.publishDate);
        const next = nextPublishDate(planned, now);
        if (next.moved) {
          await this.postiz.movePublishDate(input.orgId, post.id, next.date);
          moved.push(`${channelOf(post)}: ${romeDateTimeLabel(planned)} → ${romeDateTimeLabel(next.date)}`);
        }
        // changePostStatus throws only before it changes anything (post not
        // found) or on the state write itself; Temporal errors are swallowed
        await this.postiz.schedulePost(input.orgId, post.id);
        touched.push(post.id);
        lines.push(
          next.moved
            ? `${channelOf(post)}: ${romeDateTimeLabel(next.date)} (data spostata: era prevista il ${romeDateTimeLabel(
                planned
              )}, già passata al momento dell'approvazione)`
            : `${channelOf(post)}: ${romeDateTimeLabel(next.date)}`
        );
      }

      for (const id of touched) {
        let running = false;
        try {
          running = await this.postiz.postWorkflowRunning(id);
        } catch (err) {
          throw new Error(`impossibile verificare il workflow del post ${id}: ${message(err)}`);
        }
        if (!running) {
          throw new Error(`il workflow di pubblicazione del post ${id} non è partito`);
        }
      }

      await this.activity(input, {
        type: 'POST_SCHEDULED',
        visibility: 'CLIENT_VISIBLE',
        title: `Programmato: ${title}`,
        body: lines.join('\n'),
      });
      return { status: 'SCHEDULED', postIds: touched };
    } catch (err) {
      const reason = message(err);
      const problems = touched.length ? await this.rollback(input.orgId, touched) : [];
      this.logger.error(`group ${input.postGroup} approved but not scheduled: ${reason}`);
      await this.activity(input, {
        type: 'OTHER',
        visibility: 'INTERNAL',
        title: `Approvato ma non programmato: ${title}`,
        body: [
          `Motivo: ${reason}.`,
          'L\'approvazione resta valida. I post restano in bozza: programmali dal calendario quando il problema è risolto.',
          ...(moved.length
            ? [`Data già spostata (era passata): ${moved.join('; ')}.`]
            : []),
          ...(problems.length
            ? [`ATTENZIONE, verifica a mano su Postiz: ${problems.join('; ')}.`]
            : []),
        ].join('\n'),
      });
      return { status: 'FAILED', reason };
    }
  }

  async unscheduleReopened(input: GroupInput): Promise<ScheduleOutcome> {
    const title = input.title || 'contenuto';
    try {
      const posts = (await this.postiz.postsByGroup(input.orgId, input.postGroup)) as GroupPost[];
      const queued = posts.filter((post) => !post.parentPostId && post.state === 'QUEUE');
      if (!queued.length) {
        return { status: 'NOTHING_TO_DO' };
      }
      const problems = await this.rollback(
        input.orgId,
        queued.map((post) => post.id)
      );
      if (problems.length) {
        throw new Error(problems.join('; '));
      }
      return { status: 'UNSCHEDULED', postIds: queued.map((post) => post.id) };
    } catch (err) {
      const reason = message(err);
      this.logger.error(`group ${input.postGroup} reopened but maybe still scheduled: ${reason}`);
      await this.activity(input, {
        type: 'OTHER',
        visibility: 'INTERNAL',
        title: `Riaperto ma ancora programmato: ${title}`,
        body: `La scelta è stata riaperta, ma non è stato possibile annullare la programmazione: ${reason}.\nControlla subito il calendario Postiz e riporta i post in bozza a mano.`,
      });
      return { status: 'FAILED', reason };
    }
  }
}
