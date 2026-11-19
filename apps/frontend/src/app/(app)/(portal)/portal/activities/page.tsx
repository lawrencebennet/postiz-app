'use client';

import { PortalList, PortalShell } from '@gitroom/frontend/components/neptive/portal';
import { formatWhen, kindLabel } from '@gitroom/frontend/components/neptive/neptive.ui';

export default function Page() {
  return (
    <PortalShell>
      <PortalList
        path="activities"
        eyebrow="Lavoro svolto"
        title="Cosa abbiamo fatto."
        intro="Le attività di Neptive sul tuo account, dalla più recente."
        empty="Ancora nessuna attività registrata."
        render={(row) => (
          <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-[6px] md:gap-[24px]">
            <div className="nx-label pt-[3px]">
              {kindLabel(row.type)}
              {row.occurredAt ? ` · ${formatWhen(row.occurredAt)}` : ''}
            </div>
            <div className="min-w-0">
              <div className="nx-heading text-[18px]">{row.title}</div>
              {row.body && (
                <div className="text-[15px] leading-[1.5] mt-[6px] text-[var(--nx-text-muted)] break-words">{row.body}</div>
              )}
            </div>
          </div>
        )}
      />
    </PortalShell>
  );
}
