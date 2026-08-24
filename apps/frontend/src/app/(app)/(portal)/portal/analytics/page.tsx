'use client';

import { PortalList, PortalShell } from '@gitroom/frontend/components/neptive/portal';

export default function Page() {
  return (
    <PortalShell>
      <PortalList
        path="analytics?date=30"
        title="Results"
        render={(row) => (
          <div>
            <div className="font-[600]">
              {row.name} · {row.provider}
            </div>
            <div className="text-[12px] text-newTableText">
              {Array.isArray(row.data) ? `${row.data.length} metrics` : 'No data'}
            </div>
          </div>
        )}
      />
    </PortalShell>
  );
}
