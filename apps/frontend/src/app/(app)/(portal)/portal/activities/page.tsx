'use client';

import { PortalList, PortalShell } from '@gitroom/frontend/components/neptive/portal';

export default function Page() {
  return (
    <PortalShell>
      <PortalList
        path="activities"
        title="Work performed"
        render={(row) => (
          <div>
            <div className="text-[11px] text-newTableText">{row.type}</div>
            <div className="font-[600]">{row.title}</div>
            {row.body && <div className="text-[13px]">{row.body}</div>}
          </div>
        )}
      />
    </PortalShell>
  );
}
