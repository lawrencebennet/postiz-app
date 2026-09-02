import { normalizePreviewIdentity, type PreviewIdentity } from './preview-identity';

export type PreviewPlatform = 'instagram' | 'facebook';

export type PreviewMedia = {
  id: string;
  path: string;
  type: string;
  thumbnail?: string;
  alt?: string;
  order: number;
};

export type PreviewContent = {
  postGroup: string;
  title: string;
  caption: string;
  platform: string;
  platforms: string[];
  channel: string;
  profileImage?: string | null;
  scheduledAt: string;
  contentType: string;
  media: PreviewMedia[];
  publishingState: string;
  variants?: Array<{
    postId: string;
    platform: string;
    channel: string;
    profileImage?: string | null;
    caption: string;
    scheduledAt: string;
    contentType: string;
    media: PreviewMedia[];
    publishingState: string;
  }>;
};

export type PlatformPreviewModel = {
  postGroup: string;
  title: string;
  caption: string;
  platform: PreviewPlatform;
  channel: string;
  profile: { name: string; image: string | null };
  scheduledAt: string;
  contentType: string;
  media: PreviewMedia[];
  publishingState: string;
};

const plainText = (value: string) =>
  value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const matchingVariant = (content: PreviewContent, platform: PreviewPlatform) =>
  content.variants?.find(
    (variant) => variant.platform.toLowerCase() === platform
  );

export function normalizePreviewContent(
  content: PreviewContent,
  identity: PreviewIdentity | unknown,
  platform: PreviewPlatform
): PlatformPreviewModel {
  const safeIdentity = normalizePreviewIdentity(identity as any);
  const variant = matchingVariant(content, platform);
  const source = variant || content;
  const profile = safeIdentity[platform];
  return {
    postGroup: content.postGroup,
    title: content.title,
    caption: plainText(source.caption || content.caption || ''),
    platform,
    channel: source.channel || content.channel,
    profile: {
      name: profile.name || source.channel || `${platform} profile`,
      image: profile.image || source.profileImage || content.profileImage || null,
    },
    scheduledAt: source.scheduledAt || content.scheduledAt,
    contentType: source.contentType || content.contentType,
    media: source.media.map((item, index) => ({ ...item, order: index })),
    publishingState: source.publishingState || content.publishingState,
  };
}

export function swipeDirection(deltaX: number, threshold = 48): -1 | 0 | 1 {
  if (Math.abs(deltaX) < Math.max(1, threshold)) return 0;
  return deltaX < 0 ? 1 : -1;
}
