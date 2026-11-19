'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { NeptiveBadge, statusLabel, statusTone } from '@gitroom/frontend/components/neptive/neptive.ui';

export type PedContent = {
  postGroup: string;
  title: string;
  caption: string;
  platform: string;
  platforms: string[];
  channel: string;
  scheduledAt: string;
  contentType: string;
  profileImage?: string | null;
  media: Array<{ id: string; path: string; thumbnail?: string; type: string; order: number; alt?: string }>;
  publishingState: string;
  variants?: Array<{
    postId: string;
    platform: string;
    channel: string;
    caption: string;
    scheduledAt: string;
    contentType: string;
    profileImage?: string | null;
    media: Array<{ id: string; path: string; thumbnail?: string; type: string; order: number; alt?: string }>;
    publishingState: string;
  }>;
};

export type PedApproval = {
  id: string;
  status: string;
  approvedAt?: string | null;
  comments?: Array<{
    id: string;
    authorName: string;
    authorType?: string;
    visibility?: string;
    body: string;
    createdAt: string;
  }>;
  actions?: Array<{ action: string; actorType: string; comment?: string | null; createdAt: string }>;
  requestedChangesNote?: string | null;
};

/** One alternative (A, B, C...) for a slot; see NeptiveVariantService.projectItem. */
export type PedVariant = {
  id: string;
  implicit: boolean;
  label: string;
  position: number;
  postGroup: string;
  content: PedContent | null;
  linkStatus: string;
  approval: PedApproval | null;
  state: string;
  client?: { canDecide: boolean; canComment: boolean };
  agency?: { canRemove: boolean; canSendToClient: boolean };
};

export type PedCalendarItem = {
  id: string;
  title: string;
  notes?: string | null;
  position: number;
  linkStatus?: string;
  /** lead variant (confirmed one, else the first): what calendar cards show */
  content?: PedContent | null;
  approval?: PedApproval | null;
  slot?: {
    mode: 'SINGLE' | 'VARIANTS';
    state: 'OPEN' | 'CONFIRMED';
    confirmedVariantId: string | null;
    confirmedAt?: string | null;
  };
  variants?: PedVariant[];
  removedVariants?: Array<{ id: string; label: string; postGroup: string; removedAt: string }>;
};

const typeLabels: Record<string, string> = {
  POST: 'Post',
  CAROUSEL: 'Carosello',
  REEL: 'Reel',
  STORY: 'Story',
  VIDEO: 'Video',
};

export const contentTypeLabel = (value?: string) =>
  typeLabels[value || ''] || value || 'Contenuto';

export const formatPedDate = (value?: string | null) => {
  if (!value) return 'Data da definire';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data da definire';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const PedContentCard: FC<{
  item: PedCalendarItem;
  onOpen: (item: PedCalendarItem) => void;
  /** calendar cell: thumbnail, time and title only */
  compact?: boolean;
}> = ({ item, onOpen, compact = false }) => {
  const content = item.content;
  const firstMedia = content?.media?.[0];
  const platform = content?.platform || '';
  const approvalStatus = item.approval?.status || 'NOT_SUBMITTED';
  const publishingState = content?.publishingState || 'UNLINKED';
  const variantCount = item.variants?.length || 0;
  const confirmed = item.variants?.find((variant) => variant.id === item.slot?.confirmedVariantId);
  const title = item.title || content?.title || 'Contenuto';

  const thumb = (
    <div className={clsx('bg-[var(--nx-bg)] flex items-center justify-center overflow-hidden', compact ? 'aspect-square' : 'aspect-[16/10]')}>
      {firstMedia ? (
        firstMedia.type === 'video' ? (
          <video src={firstMedia.path} poster={firstMedia.thumbnail} preload="metadata" muted className="h-full w-full object-cover" />
        ) : (
          <img src={firstMedia.thumbnail || firstMedia.path} alt="" className="h-full w-full object-cover" />
        )
      ) : (
        <span className="px-[8px] nx-label text-center">Nessuna anteprima</span>
      )}
    </div>
  );

  if (compact) {
    return (
      <button
        type="button"
        title={title}
        className="block w-full min-w-0 text-left rounded-[2px] border border-[var(--nx-line)] bg-[var(--nx-surface)] overflow-hidden hover:border-[var(--nx-text)] transition-colors"
        onClick={() => onOpen(item)}
      >
        {thumb}
        <div className="p-[5px] min-w-0">
          <div className="nx-mono text-[10px] text-[var(--nx-text-muted)] truncate">
            {formatPedDate(content?.scheduledAt).split(', ').pop()}
            {variantCount > 1 && ` · ${confirmed ? confirmed.label + ' ✓' : variantCount + ' var.'}`}
          </div>
          <div className="text-[11px] leading-[1.25] font-[600] line-clamp-2 break-words">{title}</div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="w-full min-w-0 text-left rounded-[var(--nx-r)] border border-[var(--nx-line)] bg-[var(--nx-surface)] overflow-hidden hover:border-[var(--nx-text)] transition-colors"
      onClick={() => onOpen(item)}
    >
      {thumb}
      <div className="p-[10px] flex flex-col gap-[7px] min-w-0">
        <div className="flex items-center justify-between gap-[6px] nx-label">
          <span className="truncate">{formatPedDate(content?.scheduledAt)}</span>
          {platform && (
            <span className="inline-flex items-center gap-[4px] shrink-0">
              <img src={`/icons/platforms/${platform}.png`} alt="" className="h-[14px] w-[14px]" />
              {platform}
            </span>
          )}
        </div>
        <div className="font-[600] text-[14px] leading-[1.3] line-clamp-2 break-words">{title}</div>
        <div className="flex flex-wrap gap-[4px]">
          <NeptiveBadge>{contentTypeLabel(content?.contentType)}</NeptiveBadge>
          {content?.contentType === 'CAROUSEL' && <NeptiveBadge>{content.media.length} slide</NeptiveBadge>}
          {variantCount > 1 ? (
            <NeptiveBadge tone={confirmed ? 'good' : 'warn'}>
              {confirmed ? `Variante ${confirmed.label} confermata` : `${variantCount} varianti`}
            </NeptiveBadge>
          ) : (
            <NeptiveBadge tone={statusTone(approvalStatus)}>
              {approvalStatus === 'NOT_SUBMITTED' ? 'Da collegare' : statusLabel(approvalStatus)}
            </NeptiveBadge>
          )}
        </div>
        <div className="text-[12px] leading-[1.4] text-[var(--nx-text-muted)] line-clamp-2 break-words">
          {content?.caption ||
            (item.linkStatus === 'MISSING' ? 'Contenuto collegato non disponibile' : 'Collega un contenuto')}
        </div>
        <div className="nx-label">Pubblicazione: {statusLabel(publishingState)}</div>
      </div>
    </button>
  );
};
