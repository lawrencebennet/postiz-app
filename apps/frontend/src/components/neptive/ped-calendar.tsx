'use client';

import { FC, useMemo } from 'react';
import { NeptiveCard, NeptiveEmpty } from '@gitroom/frontend/components/neptive/neptive.ui';
import { PedCalendarItem, PedContentCard } from '@gitroom/frontend/components/neptive/ped-content-card';

const dayLabels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

const dateKey = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

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
}> = ({ items, periodStart, periodEnd, onOpen }) => {
  const start = useMemo(() => {
    const date = new Date(periodStart || new Date().toISOString());
    date.setDate(1);
    return date;
  }, [periodStart]);
  const cells = useMemo(() => {
    const firstDay = (start.getDay() + 6) % 7;
    const totalDays = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    return Array.from({ length: firstDay + totalDays }, (_, index) => index < firstDay ? null : index - firstDay + 1);
  }, [start]);
  const byDate = useMemo(() => items.reduce<Record<string, PedCalendarItem[]>>((all, item) => {
    const key = dateKey(item.content?.scheduledAt);
    if (key) (all[key] ||= []).push(item);
    return all;
  }, {}), [items]);
  const monthLabel = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(start);

  return (
    <NeptiveCard title={`Calendario · ${monthLabel}`}>
      <div className="hidden md:grid grid-cols-7 gap-[6px] mb-[6px]">
        {dayLabels.map((label) => <div key={label} className="text-[11px] text-newTableText px-[6px]">{label}</div>)}
      </div>
      <div className="hidden md:grid grid-cols-7 gap-[6px]">
        {cells.map((day, index) => {
          const key = day ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
          return <div key={`${key}-${index}`} className="min-h-[145px] rounded-[8px] border border-newTableBorder bg-newBgColor p-[5px]">
            {day && <div className="text-[11px] text-newTableText mb-[5px]">{day}</div>}
            <div className="flex flex-col gap-[5px]">{(byDate[key] || []).map((item) => <PedContentCard key={item.id} item={item} onOpen={onOpen} />)}</div>
          </div>;
        })}
      </div>
      <div className="md:hidden flex flex-col gap-[8px]">
        {items.slice().sort((a, b) => String(a.content?.scheduledAt || '').localeCompare(String(b.content?.scheduledAt || ''))).map((item) => <PedContentCard key={item.id} item={item} onOpen={onOpen} />)}
        {!items.length && <NeptiveEmpty>Nessun contenuto in questo PED</NeptiveEmpty>}
      </div>
      {periodEnd && <div className="text-[11px] text-newTableText mt-[10px]">Periodo: {periodStart?.slice(0, 10)} → {periodEnd.slice(0, 10)}</div>}
    </NeptiveCard>
  );
};

export const PedContentList: FC<{
  items: PedCalendarItem[];
  onOpen: (item: PedCalendarItem) => void;
}> = ({ items, onOpen }) => (
  <NeptiveCard title="Contenuti in ordine cronologico">
    <div className="flex flex-col gap-[8px]">
      {items.slice().sort((a, b) => String(a.content?.scheduledAt || '').localeCompare(String(b.content?.scheduledAt || ''))).map((item) => <PedContentCard key={item.id} item={item} onOpen={onOpen} />)}
      {!items.length && <NeptiveEmpty>Nessun contenuto collegato</NeptiveEmpty>}
    </div>
  </NeptiveCard>
);
