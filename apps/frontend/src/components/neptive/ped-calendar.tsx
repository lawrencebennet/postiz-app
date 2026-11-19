'use client';

import { FC, useMemo } from 'react';
import clsx from 'clsx';
import { NeptiveCard, NeptiveEmpty, formatPeriod } from '@gitroom/frontend/components/neptive/neptive.ui';
import { PedCalendarItem, PedContentCard } from '@gitroom/frontend/components/neptive/ped-content-card';

const dayLabels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

const dateKey = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const byDateAsc = (a: PedCalendarItem, b: PedCalendarItem) =>
  String(a.content?.scheduledAt || '').localeCompare(String(b.content?.scheduledAt || ''));

export const pedSummary = (items: PedCalendarItem[]) => {
  const counts = items.reduce<Record<string, number>>((all, item) => {
    const type = item.content?.contentType || 'UNLINKED';
    all[type] = (all[type] || 0) + 1;
    return all;
  }, {});
  return {
    total: items.length,
    carousels: counts.CAROUSEL || 0,
    reels: counts.REEL || 0,
    posts: counts.POST || 0,
    stories: counts.STORY || 0,
    videos: counts.VIDEO || 0,
  };
};

export const PedCalendar: FC<{
  items: PedCalendarItem[];
  periodStart?: string;
  periodEnd?: string;
  onOpen: (item: PedCalendarItem) => void;
  /** false when the page already lists the items below (portal feed) */
  mobileList?: boolean;
  /** no card frame (the caller already draws one) */
  bare?: boolean;
}> = ({ items, periodStart, periodEnd, onOpen, mobileList = true, bare = false }) => {
  const start = useMemo(() => {
    const date = new Date(periodStart || new Date().toISOString());
    date.setDate(1);
    return date;
  }, [periodStart]);
  const cells = useMemo(() => {
    const firstDay = (start.getDay() + 6) % 7;
    const totalDays = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    return Array.from({ length: firstDay + totalDays }, (_, index) => (index < firstDay ? null : index - firstDay + 1));
  }, [start]);
  const byDate = useMemo(
    () =>
      items.reduce<Record<string, PedCalendarItem[]>>((all, item) => {
        const key = dateKey(item.content?.scheduledAt);
        if (key) (all[key] ||= []).push(item);
        return all;
      }, {}),
    [items]
  );
  const monthLabel = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(start);

  // repeat(7, minmax(0, 1fr)): a day column never grows with its content (Tailwind's grid-cols-7 is
  // minmax(0,1fr) too, but the cards inside had an intrinsic min width through their media); with min-w-0
  // on every level the month always fits its container instead of overflowing to the right
  const body = (
    <div className="min-w-0">
      <div className="hidden md:grid grid-cols-[repeat(7,minmax(0,1fr))] gap-[6px] mb-[6px]">
        {dayLabels.map((label) => (
          <div key={label} className="nx-label px-[4px]">
            {label}
          </div>
        ))}
      </div>
      <div className="hidden md:grid grid-cols-[repeat(7,minmax(0,1fr))] gap-[6px]">
        {cells.map((day, index) => {
          const key = day
            ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            : '';
          return (
            <div
              key={`${key}-${index}`}
              className={clsx(
                'min-w-0 min-h-[110px] rounded-[2px] p-[5px]',
                day && 'bg-[var(--nx-bg)] border border-[var(--nx-line)]'
              )}
            >
              {day && <div className="nx-mono text-[11px] text-[var(--nx-text-muted)] mb-[5px]">{day}</div>}
              <div className="flex flex-col gap-[5px] min-w-0">
                {(byDate[key] || []).map((item) => (
                  <PedContentCard key={item.id} item={item} onOpen={onOpen} compact />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {mobileList && (
        <div className="md:hidden flex flex-col gap-[8px]">
          {items
            .slice()
            .sort(byDateAsc)
            .map((item) => (
              <PedContentCard key={item.id} item={item} onOpen={onOpen} />
            ))}
          {!items.length && <NeptiveEmpty>Nessun contenuto in questo piano.</NeptiveEmpty>}
        </div>
      )}
      {periodEnd && <div className="nx-label mt-[10px]">Periodo: {formatPeriod(periodStart, periodEnd)}</div>}
    </div>
  );

  if (bare) return body;
  return <NeptiveCard title={`Calendario · ${monthLabel}`}>{body}</NeptiveCard>;
};

export const PedContentList: FC<{
  items: PedCalendarItem[];
  onOpen: (item: PedCalendarItem) => void;
}> = ({ items, onOpen }) => (
  <NeptiveCard title="Contenuti in ordine cronologico">
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-[8px] min-w-0">
      {items
        .slice()
        .sort(byDateAsc)
        .map((item) => (
          <PedContentCard key={item.id} item={item} onOpen={onOpen} />
        ))}
    </div>
    {!items.length && <NeptiveEmpty>Nessun contenuto collegato.</NeptiveEmpty>}
  </NeptiveCard>
);
