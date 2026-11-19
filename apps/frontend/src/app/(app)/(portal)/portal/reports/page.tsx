'use client';

import { PortalList, PortalShell } from '@gitroom/frontend/components/neptive/portal';
import {
  NeptiveBadge,
  formatPeriod,
  statusLabel,
  statusTone,
} from '@gitroom/frontend/components/neptive/neptive.ui';

export default function Page() {
  return (
    <PortalShell>
      <PortalList
        path="reports"
        eyebrow="Report"
        title="I numeri del mese."
        empty="Nessun report pubblicato."
        render={(row) => {
          const snapshot = row.snapshot || {};
          return (
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-[12px]">
                <div className="min-w-0">
                  <div className="nx-label">{formatPeriod(row.periodStart, row.periodEnd)}</div>
                  <div className="nx-heading text-[20px] mt-[2px] break-words">{row.title}</div>
                </div>
                <NeptiveBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</NeptiveBadge>
              </div>
              <div className="grid grid-cols-2 gap-[8px] mt-[14px] max-w-[420px]">
                <div className="nx-card !bg-[var(--nx-bg)] p-[12px]">
                  <div className="nx-display text-[40px]">{snapshot.publishedCount ?? 0}</div>
                  <div className="nx-label mt-[6px]">Post pubblicati</div>
                </div>
                <div className="nx-card !bg-[var(--nx-bg)] p-[12px]">
                  <div className="nx-display text-[40px]">{snapshot.activitiesPerformed ?? 0}</div>
                  <div className="nx-label mt-[6px]">Attività svolte</div>
                </div>
              </div>
              {row.narrative && (
                <div className="text-[15px] leading-[1.55] mt-[14px] whitespace-pre-wrap text-[var(--nx-text-muted)] break-words">
                  {row.narrative}
                </div>
              )}
            </div>
          );
        }}
      />
    </PortalShell>
  );
}
