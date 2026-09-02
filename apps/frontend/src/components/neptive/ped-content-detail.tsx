'use client';

import { FC, useEffect, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { NeptiveBadge, NeptiveCard, areaClass, formatWhen, statusTone } from '@gitroom/frontend/components/neptive/neptive.ui';
import { PedCalendarItem, contentTypeLabel } from '@gitroom/frontend/components/neptive/ped-content-card';
import { PlatformPreviewSwitcher } from '@gitroom/frontend/components/neptive/preview/preview';

export const PedContentDetail: FC<{
  item: PedCalendarItem | null;
  mode: 'agency' | 'client';
  onClose: () => void;
  onApprove?: () => void;
  onRequestChanges?: (comment: string) => void;
  busy?: boolean;
  previewIdentity?: unknown;
}> = ({ item, mode, onClose, onApprove, onRequestChanges, busy, previewIdentity }) => {
  const [comment, setComment] = useState('');

  useEffect(() => {
    setComment('');
  }, [item?.id]);

  if (!item) return null;
  const content = item.content;
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

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] gap-[16px]">
            <div className="flex flex-col gap-[8px]">
              {content ? (
                <PlatformPreviewSwitcher content={content as any} identity={previewIdentity} />
              ) : (
                <div className="rounded-[10px] bg-black min-h-[300px] flex items-center justify-center text-[13px] text-white/70">Nessun contenuto Postiz collegato</div>
              )}
            </div>

            <div className="flex flex-col gap-[12px]">
              <section>
                <div className="text-[11px] uppercase tracking-[0.08em] text-newTableText mb-[5px]">Testo del post</div>
                <div className="rounded-[8px] bg-newBgColorInner p-[10px] text-[14px] whitespace-pre-wrap break-words">{content?.caption || 'Nessuna caption'}</div>
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
