import { Injectable, NotFoundException } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { TemporalService } from 'nestjs-temporal-core';
import { WorkflowNotFoundError } from '@temporalio/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { expandPostsList } from '@gitroom/helpers/utils/posts.list.minify';
import { postPreviewText } from '@gitroom/nestjs-libraries/neptive/domain/post-preview';
import {
  projectPostGroup,
  type NeptiveContentProjection,
  type ProjectionPost,
} from '@gitroom/nestjs-libraries/neptive/domain/content-projection';

@Injectable()
export class PostizAdapter {
  constructor(
    private integrations: IntegrationService,
    private posts: PostsService,
    private media: MediaService,
    private prisma: PrismaService,
    private temporal: TemporalService
  ) {}

  // ------------------------------------------------- scheduling bridge
  // Used by NeptivePublishScheduler. State changes go through PostsService only
  // (QUEUE/DRAFT + postWorkflowV112 start/terminate); the Temporal reads below
  // exist because PostsService.startWorkflow swallows every Temporal error.

  schedulePost(orgId: string, postId: string) {
    return this.posts.changePostStatus(orgId, postId, 'schedule');
  }

  unschedulePost(orgId: string, postId: string) {
    return this.posts.changePostStatus(orgId, postId, 'draft');
  }

  /** Date only (action 'update'): state and workflow untouched. */
  movePublishDate(orgId: string, postId: string, date: Date) {
    return this.posts.changeDate(orgId, postId, date.toISOString(), 'update');
  }

  private rawTemporal() {
    const raw = this.temporal?.client?.getRawClient?.();
    if (!raw) {
      throw new Error('Temporal client not connected');
    }
    return raw;
  }

  private withTimeout<T>(promise: Promise<T>, what: string, ms = 8000) {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Temporal timeout (${what})`)), ms);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  /** Throws unless the Temporal frontend answers. */
  async assertSchedulerReachable() {
    const raw = this.rawTemporal();
    await this.withTimeout(
      raw.workflowService.getSystemInfo({}),
      'system info'
    );
  }

  /**
   * True if workflow post_<id> (the id PostsService.startWorkflow uses) is running.
   * False if it is not running or does not exist. Throws when it cannot tell.
   */
  async postWorkflowRunning(postId: string) {
    const raw = this.rawTemporal();
    try {
      const description = await this.withTimeout(
        raw.workflow.getHandle(`post_${postId}`).describe(),
        'describe'
      );
      return description?.status?.name === 'RUNNING';
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) {
        return false;
      }
      throw err;
    }
  }

  async integrationsForCustomer(orgId: string, customerId: string) {
    const list = await this.integrations.getIntegrationsList(orgId);
    return list.filter((item) => item.customerId === customerId);
  }

  async postsForCustomer(
    orgId: string,
    customerId: string,
    state: 'all' | 'scheduled' | 'draft' | 'published' = 'all'
  ) {
    const minified = await this.posts.getPostsList(orgId, {
      customer: customerId,
      state,
      page: 0,
      limit: 100,
    });
    return expandPostsList(minified);
  }

  postsByGroup(orgId: string, group: string) {
    return this.prisma.post.findMany({
      where: { organizationId: orgId, group, deletedAt: null },
      include: { integration: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async contentByGroup(
    orgId: string,
    customerId: string,
    postGroup: string,
    title?: string
  ): Promise<NeptiveContentProjection> {
    const posts = await this.postsByGroup(orgId, postGroup);
    return projectPostGroup(posts as ProjectionPost[], {
      orgId,
      customerId,
      title,
    });
  }

  async assertPostGroupBelongsToCustomer(
    orgId: string,
    customerId: string,
    postGroup: string
  ) {
    const groupPosts = await this.postsByGroup(orgId, postGroup);
    if (!groupPosts.length) {
      throw new NotFoundException('Post group not found');
    }
    const customerOk = groupPosts.every(
      (post) => post.integration?.customerId === customerId
    );
    if (!customerOk) {
      throw new NotFoundException('Post group not found');
    }
    return groupPosts;
  }

  groupPreview(
    posts: Array<{
      content: unknown;
      parentPostId?: string | null;
      state: string;
      publishDate: Date;
      integration?: { providerIdentifier: string; name: string } | null;
    }>
  ) {
    const root = posts.find((post) => !post.parentPostId) || posts[0];
    if (!root) {
      return null;
    }
    return {
      text: postPreviewText(root.content),
      provider: root.integration?.providerIdentifier || '',
      channel: root.integration?.name || '',
      publishDate: root.publishDate,
      state: root.state,
    };
  }

  async changeGroupPublishAuthorization(
    orgId: string,
    postGroup: string,
    authorizeSchedule: boolean
  ) {
    const groupPosts = await this.postsByGroup(orgId, postGroup);
    const roots = groupPosts.filter((post) => !post.parentPostId);
    for (const post of roots) {
      if (post.state === 'PUBLISHED' || post.state === 'ERROR') {
        continue;
      }
      if (authorizeSchedule) {
        if (post.state === 'DRAFT') {
          await this.posts.changePostStatus(orgId, post.id, 'schedule');
        }
      } else if (post.state === 'QUEUE') {
        await this.posts.changePostStatus(orgId, post.id, 'draft');
      }
    }
  }

  async analyticsForCustomer(
    org: Organization,
    customerId: string,
    date: string
  ) {
    const channels = await this.integrationsForCustomer(org.id, customerId);
    const results = [];
    for (const channel of channels) {
      try {
        const data = await this.integrations.checkAnalytics(
          org,
          channel.id,
          date
        );
        results.push({
          integrationId: channel.id,
          name: channel.name,
          provider: channel.providerIdentifier,
          data,
        });
      } catch {
        results.push({
          integrationId: channel.id,
          name: channel.name,
          provider: channel.providerIdentifier,
          data: [],
        });
      }
    }
    return results;
  }

  async mediaById(orgId: string, mediaId: string) {
    const row = await this.media.getMediaById(mediaId);
    if (!row || row.organizationId !== orgId) {
      return null;
    }
    return row;
  }

  countPublishedInRange(
    orgId: string,
    customerId: string,
    from: Date,
    to: Date
  ) {
    return this.prisma.post.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
        parentPostId: null,
        state: 'PUBLISHED',
        publishDate: { gte: from, lte: to },
        integration: { customerId, deletedAt: null },
      },
    });
  }
}
