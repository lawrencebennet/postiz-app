'use client';

import { FC, useEffect, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { NeptiveBadge, NeptiveCard, areaClass, formatWhen, statusTone } from '@gitroom/frontend/components/neptive/neptive.ui';
import { PedCalendarItem, contentTypeLabel } from '@gitroom/frontend/components/neptive/ped-content-card';

export const PedContentDetail: FC<{
  item: PedCalendarItem | null;
  mode: 'agency' | 'client';
  onClose: () => void;
  onApprove?: () => void;
  onRequestChanges?: (comment: string) => void;
  busy?: boolean;
}> = ({ item, mode, onClose, onApprove, onRequestChanges, busy }) => {
  const [variantIndex, setVariantIndex] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const [comment, setComment] = useState('');

  useEffect(() => {
    setVariantIndex(0);
    setSlideIndex(0);
    setComment('');
  }, [item?.id]);

  if (!item) return null;
  const content = item.content;
  const variants = content?.variants || [];
  const active = variants[variantIndex] || content;
  const media = active?.media || [];
  const current = media[slideIndex];
  const approval = item.approval;
  const canClientReview = mode === 'client' && approval?.status === 'PENDING_CLIENT_APPROVAL';

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 p-[12px] md:p-[32px] overflow-y-auto" role="dialog" aria-modal="true">
      <div className="max-w-[1050px] mx-auto min-h-full flex items-center">
        <NeptiveCard className="w-full !bg-newBgColor">
          <div className="flex items-start justify-between gap-[16px] mb-[14px]">
            <div>
              <div className="text-[11px] text-newTableText uppercase tracking-[0.08em]">Anteprima contenuto</div>
              <h2 className="text-[20px] font-[700]">{item.title || content?.title || 'Contenuto Postiz'}</h2>
              <div className="text-[12px] text-newTableText mt-[4px]">
                {content?.channel || 'Canale da definire'} · {contentTypeLabel(content?.contentType)} · {formatWhen(content?.scheduledAt)}
              </div>
            </div>
            <button type="button" className="text-[20px] text-newTableText" onClick={onClose} aria-label="Chiudi">×</button>
          </div>

          {variants.length > 1 && (
            <div className="flex flex-wrap gap-[6px] mb-[12px]">
              {variants.map((variant: any, index: number) => (
                <button
                  type="button"
                  key={variant.postId}
                  className={`px-[10px] py-[6px] rounded-[7px] text-[12px] ${variantIndex === index ? 'bg-boxFocused text-textItemFocused' : 'bg-newBtnSimple'}`}
                  onClick={() => { setVariantIndex(index); setSlideIndex(0); }}
                >
                  {variant.platform} · {variant.channel}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] gap-[16px]">
            <div className="flex flex-col gap-[8px]">
              <div className="rounded-[10px] bg-black min-h-[300px] md:min-h-[520px] flex items-center justify-center overflow-hidden relative">
                {current ? (
                  current.type === 'video' ? (
                    <video src={current.path} poster={current.thumbnail} controls preload="metadata" className="max-h-[520px] max-w-full w-full" />
                  ) : (
                    <img src={current.path} alt={current.alt || `Slide ${slideIndex + 1}`} className="max-h-[520px] max-w-full object-contain" />
                  )
                ) : (
                  <div className="text-[13px] text-white/70">Nessun media collegato</div>
                )}
                {media.length > 1 && (
                  <>
                    <button type="button" className="absolute left-[10px] top-1/2 -translate-y-1/2 rounded-full bg-black/60 text-white text-[24px] w-[38px] h-[38px]" onClick={() => setSlideIndex((slideIndex - 1 + media.length) % media.length)} aria-label="Slide precedente">‹</button>
                    <button type="button" className="absolute right-[10px] top-1/2 -translate-y-1/2 rounded-full bg-black/60 text-white text-[24px] w-[38px] h-[38px]" onClick={() => setSlideIndex((slideIndex + 1) % media.length)} aria-label="Slide successiva">›</button>
                  </>
                )}
              </div>
              {media.length > 0 && (
                <div className="flex gap-[6px] overflow-x-auto pb-[4px]">
                  {media.map((mediaItem: any, index: number) => (
                    <button type="button" key={mediaItem.id || index} className={`relative shrink-0 h-[54px] w-[54px] rounded-[6px] overflow-hidden border-2 ${slideIndex === index ? 'border-textColor' : 'border-transparent'}`} onClick={() => setSlideIndex(index)} aria-label={`Vai alla slide ${index + 1}`}>
                      {mediaItem.type === 'video' ? <video src={mediaItem.path} poster={mediaItem.thumbnail} muted preload="metadata" className="h-full w-full object-cover" /> : <img src={mediaItem.thumbnail || mediaItem.path} alt="" className="h-full w-full object-cover" />}
                      <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[10px] px-[3px]">{index + 1}</span>
                    </button>
                  ))}
                </div>
              )}
              {media.length > 1 && <div className="text-center text-[12px] text-newTableText">{slideIndex + 1} / {media.length}</div>}
            </div>

            <div className="flex flex-col gap-[12px]">
              <section>
                <div className="text-[11px] uppercase tracking-[0.08em] text-newTableText mb-[5px]">Testo del post</div>
                <div className="rounded-[8px] bg-newBgColorInner p-[10px] text-[14px] whitespace-pre-wrap break-words">{active?.caption || content?.caption || 'Nessuna caption'}</div>
              </section>
              <section className="flex flex-wrap gap-[5px]">
                <NeptiveBadge>{content?.platform || '—'}</NeptiveBadge>
                <NeptiveBadge>{contentTypeLabel(content?.contentType)}</NeptiveBadge>
                <NeptiveBadge tone={statusTone(content?.publishingState || '')}>{content?.publishingState || 'UNLINKED'}</NeptiveBadge>
                {approval && <NeptiveBadge tone={statusTone(approval.status)}>{approval.status}</NeptiveBadge>}
              </section>
              <section className="text-[13px]">
                <div className="text-[11px] uppercase tracking-[0.08em] text-newTableText mb-[5px]">Programmazione</div>
                <div>{formatWhen(content?.scheduledAt)}</div>
                <div className="text-[12px] text-newTableText">{content?.channel || 'Canale non collegato'}</div>
              </section>
              {mode === 'agency' && item.notes && (
                <section>
                  <div className="text-[11px] uppercase tracking-[0.08em] text-newTableText mb-[5px]">Nota agenzia</div>
                  <div className="text-[13px] whitespace-pre-wrap">{item.notes}</div>
                </section>
              )}
              {!!approval?.comments?.length && (
                <section>
                  <div className="text-[11px] uppercase tracking-[0.08em] text-newTableText mb-[5px]">Feedback</div>
                  <div className="flex flex-col gap-[5px] text-[12px]">
                    {approval.comments.map((entry) => <div key={entry.id}><strong>{entry.authorName}:</strong> {entry.body}</div>)}
                  </div>
                </section>
              )}
              {canClientReview && (
                <section className="border-t border-newTableBorder pt-[12px] flex flex-col gap-[8px]">
                  <textarea className={areaClass} placeholder="Commento richiesto per chiedere modifiche" value={comment} onChange={(event) => setComment(event.target.value)} />
                  <div className="flex flex-wrap gap-[8px]">
                    <Button onClick={onApprove} disabled={busy}>Approva contenuto</Button>
                    <Button secondary onClick={() => { if (comment.trim()) onRequestChanges?.(comment.trim()); }} disabled={busy || !comment.trim()}>Richiedi modifica</Button>
                  </div>
                </section>
              )}
            </div>
          </div>
        </NeptiveCard>
      </div>
    </div>
  );
};
