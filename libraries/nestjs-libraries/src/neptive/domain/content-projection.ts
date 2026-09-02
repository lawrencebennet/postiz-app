import { postPreviewText } from './post-preview';

export type ProjectionMedia = {
  id: string;
  path: string;
  type: 'image' | 'video' | string;
  thumbnail?: string;
  alt?: string;
  order: number;
};

export type ProjectionVariant = {
  postId: string;
  platform: string;
  channel: string;
  caption: string;
  scheduledAt: string;
  contentType: NeptiveContentType;
  media: ProjectionMedia[];
  publishingState: string;
  releaseURL?: string | null;
};

export type NeptiveContentType =
  | 'POST'
  | 'CAROUSEL'
  | 'REEL'
  | 'STORY'
  | 'VIDEO';

export type NeptiveContentProjection = {
  postGroup: string;
  title: string;
  caption: string;
  platform: string;
  platforms: string[];
  channel: string;
  scheduledAt: string;
  contentType: NeptiveContentType;
  media: ProjectionMedia[];
  publishingState: string;
  releaseURL?: string | null;
  postIds: string[];
  variants: ProjectionVariant[];
};

export type ProjectionPost = {
  id: string;
  organizationId: string;
  group: string;
  parentPostId?: string | null;
  content: unknown;
  image?: unknown;
  publishDate: Date | string;
  state: string;
  settings?: unknown;
  title?: string | null;
  releaseURL?: string | null;
  integration: {
    id: string;
    customerId?: string | null;
    providerIdentifier: string;
    name: string;
    picture?: string | null;
  };
};

type ProjectionOptions = {
  orgId: string;
  customerId: string;
  title?: string;
};

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|quicktime)(?:$|\?)/i;

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function settingsOf(post: ProjectionPost): Record<string, any> {
  const value = parseJson(post.settings);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function mediaType(item: Record<string, any>): 'image' | 'video' | string {
  if (item.type === 'video' || VIDEO_EXTENSIONS.test(String(item.path || ''))) {
    return 'video';
  }
  return item.type || 'image';
}

export function projectMedia(value: unknown): ProjectionMedia[] {
  const list = parseJson(value);
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((item) => item && typeof item === 'object' && item.path)
    .map((item, order) => {
      const media = item as Record<string, any>;
      return {
        id: String(media.id || `${order + 1}`),
        path: String(media.path),
        type: mediaType(media),
        ...(media.thumbnail ? { thumbnail: String(media.thumbnail) } : {}),
        ...(media.alt ? { alt: String(media.alt) } : {}),
        order,
      };
    });
}

export function contentTypeOf(
  post: Pick<ProjectionPost, 'integration' | 'settings'>,
  media: ProjectionMedia[]
): NeptiveContentType {
  const settings = settingsOf(post as ProjectionPost);
  const provider = post.integration.providerIdentifier.toLowerCase();
  const isInstagram = provider === 'instagram' || provider === 'instagram-standalone';

  if (settings.post_type === 'story') {
    return 'STORY';
  }
  if (media.length > 1) {
    return 'CAROUSEL';
  }
  if (media.some((item) => item.type === 'video')) {
    return isInstagram ? 'REEL' : 'VIDEO';
  }
  return 'POST';
}

function projectVariant(post: ProjectionPost): ProjectionVariant {
  const media = projectMedia(post.image);
  return {
    postId: post.id,
    platform: post.integration.providerIdentifier,
    channel: post.integration.name,
    caption: postPreviewText(post.content),
    scheduledAt: new Date(post.publishDate).toISOString(),
    contentType: contentTypeOf(post, media),
    media,
    publishingState: post.state,
    ...(post.releaseURL ? { releaseURL: post.releaseURL } : {}),
  };
}

export function projectPostGroup(
  posts: ProjectionPost[],
  options: ProjectionOptions
): NeptiveContentProjection {
  if (!posts.length) {
    throw new Error('Post group not found');
  }
  if (
    posts.some(
      (post) =>
        post.organizationId !== options.orgId ||
        post.integration.customerId !== options.customerId
    )
  ) {
    throw new Error('Post group not found');
  }

  const roots = posts.filter((post) => !post.parentPostId);
  const variants = (roots.length ? roots : posts).map(projectVariant);
  const primary = variants[0];
  const primaryPost = roots[0] || posts[0];
  const platforms = Array.from(new Set(variants.map((variant) => variant.platform)));

  return {
    postGroup: primaryPost.group,
    title: options.title || primaryPost.title || '',
    caption: primary.caption,
    platform: primary.platform,
    platforms,
    channel: primary.channel,
    scheduledAt: primary.scheduledAt,
    contentType: primary.contentType,
    media: primary.media,
    publishingState: primary.publishingState,
    ...(primary.releaseURL ? { releaseURL: primary.releaseURL } : {}),
    postIds: posts.map((post) => post.id),
    variants,
  };
}
