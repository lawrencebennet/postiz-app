'use client';

import { PortalList, PortalShell } from '@gitroom/frontend/components/neptive/portal';
import { NeptiveBadge, statusTone } from '@gitroom/frontend/components/neptive/neptive.ui';

export default function Page() {
  return (
    <PortalShell>
      <PortalList
        path="reports"
        title="Reports"
        render={(row) => {
          const snapshot = row.snapshot || {};
          return (
            <div>
              <div className="font-[600]">{row.title}</div>
              <div className="flex items-center gap-[8px] mt-[4px]">
                <NeptiveBadge tone={statusTone(row.status)}>
                  {row.status}
                </NeptiveBadge>
                <span className="text-[12px] text-newTableText">
                  {row.periodStart?.slice(0, 10)} → {row.periodEnd?.slice(0, 10)}
                </span>
              </div>
              {row.narrative && (
                <div className="text-[13px] mt-[8px] whitespace-pre-wrap">
                  {row.narrative}
                </div>
              )}
              <div className="text-[13px] mt-[8px]">
                Published {snapshot.publishedCount ?? 0} · Work logged{' '}
                {snapshot.activitiesPerformed ?? 0}
              </div>
            </div>
          );
        }}
      />
    </PortalShell>
  );
}
