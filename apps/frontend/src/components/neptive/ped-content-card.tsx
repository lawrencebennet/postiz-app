'use client';

import { FC } from 'react';
import { NeptiveBadge, statusTone } from '@gitroom/frontend/components/neptive/neptive.ui';

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
}> = ({ item, onOpen }) => {
  const content = item.content;
  const firstMedia = content?.media?.[0];
  const platform = content?.platform || '';
  const approvalStatus = item.approval?.status || 'NOT_SUBMITTED';
  const publishingState = content?.publishingState || 'UNLINKED';
  const variantCount = item.variants?.length || 0;
  const confirmed = item.variants?.find(
    (variant) => variant.id === item.slot?.confirmedVariantId
  );

  return (
    <button
      type="button"
      className="w-full text-left rounded-[10px] border border-newTableBorder bg-newBgColorInner overflow-hidden hover:border-textColor transition-colors"
      onClick={() => onOpen(item)}
    >
      <div className="aspect-[16/10] bg-newBgColor flex items-center justify-center overflow-hidden">
        {firstMedia ? (
          firstMedia.type === 'video' ? (
            <video
              src={firstMedia.path}
              poster={firstMedia.thumbnail}
              preload="metadata"
              muted
              className="h-full w-full object-cover"
            />
          ) : (
            <img src={firstMedia.thumbnail || firstMedia.path} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <span className="px-[12px] text-[12px] text-newTableText">Nessuna anteprima</span>
        )}
      </div>
      <div className="p-[10px] flex flex-col gap-[6px]">
        <div className="flex items-center justify-between gap-[6px] text-[11px] text-newTableText">
          <span>{formatPedDate(content?.scheduledAt)}</span>
          {platform && (
            <span className="inline-flex items-center gap-[4px]">
              <img src={`/icons/platforms/${platform}.png`} alt="" className="h-[15px] w-[15px]" />
              {platform}
            </span>
          )}
        </div>
        <div className="font-[600] text-[13px] line-clamp-2">{item.title || content?.title || 'Contenuto'}</div>
        <div className="flex flex-wrap gap-[4px]">
          <NeptiveBadge>{contentTypeLabel(content?.contentType)}</NeptiveBadge>
          {content?.contentType === 'CAROUSEL' && (
            <NeptiveBadge>{content.media.length} slide</NeptiveBadge>
          )}
          {variantCount > 1 ? (
            <NeptiveBadge tone={confirmed ? 'good' : 'warn'}>
              {confirmed ? `Variante ${confirmed.label} confermata` : `${variantCount} varianti`}
            </NeptiveBadge>
          ) : (
            <NeptiveBadge tone={statusTone(approvalStatus)}>
              {approvalStatus === 'NOT_SUBMITTED' ? 'Da collegare' : approvalStatus}
            </NeptiveBadge>
          )}
        </div>
        <div className="text-[11px] text-newTableText line-clamp-2">
          {content?.caption || (item.linkStatus === 'MISSING' ? 'Collegamento Neptive non disponibile' : 'Collega un contenuto Neptive')}
        </div>
        <div className="text-[10px] text-newTableText">Pubblicazione: {publishingState}</div>
      </div>
    </button>
  );
};
