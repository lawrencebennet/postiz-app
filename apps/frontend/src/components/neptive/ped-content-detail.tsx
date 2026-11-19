'use client';

import { FC, useEffect } from 'react';
import { PedCalendarItem } from '@gitroom/frontend/components/neptive/ped-content-card';
import {
  AgencySlotApi,
  PedSlotCard,
} from '@gitroom/frontend/components/neptive/ped-variants';

/** Modal around one PED slot (all its variants). Used by the agency PED page. */
export const PedContentDetail: FC<{
  item: PedCalendarItem | null;
  mode: 'agency' | 'client';
  onClose: () => void;
  onChanged?: () => Promise<unknown> | void;
  agency?: AgencySlotApi;
  previewIdentity?: unknown;
}> = ({ item, mode, onClose, onChanged, agency, previewIdentity }) => {
  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 p-[8px] md:p-[32px] overflow-y-auto" role="dialog" aria-modal="true" aria-label={item.title}>
      <div className="max-w-[1100px] mx-auto">
        <div className="flex justify-end mb-[6px]">
          <button type="button" className="text-[13px] px-[12px] h-[36px] rounded-[8px] bg-newBgColorInner text-textColor" onClick={onClose}>
            Chiudi ×
          </button>
        </div>
        <PedSlotCard
          item={item}
          mode={mode}
          previewIdentity={previewIdentity}
          onChanged={onChanged || (() => undefined)}
          agency={agency}
          className="!bg-newBgColor"
        />
      </div>
    </div>
  );
};
