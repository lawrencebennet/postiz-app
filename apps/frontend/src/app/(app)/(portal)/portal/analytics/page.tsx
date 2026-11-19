'use client';

import { PortalList, PortalShell } from '@gitroom/frontend/components/neptive/portal';

export default function Page() {
  return (
    <PortalShell>
      <PortalList
        path="analytics?date=30"
        eyebrow="Risultati"
        title="Gli ultimi 30 giorni."
        empty="Nessun canale collegato."
        render={(row) => (
          <div className="flex items-center justify-between gap-[12px]">
            <div className="min-w-0">
              <div className="nx-label">{row.provider}</div>
              <div className="nx-heading text-[18px] mt-[2px] break-words">{row.name}</div>
            </div>
            <span className="nx-label shrink-0">
              {Array.isArray(row.data) ? `${row.data.length} metriche` : 'Nessun dato'}
            </span>
          </div>
        )}
      />
    </PortalShell>
  );
}
