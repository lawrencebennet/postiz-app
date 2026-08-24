'use client';

import { PortalList, PortalShell } from '@gitroom/frontend/components/neptive/portal';

export default function Page() {
  return (
    <PortalShell>
      <PortalList
        path="strategy"
        title="Strategy"
        render={(row) => (
          <div>
            <div className="text-[11px] text-newTableText">{row.kind}</div>
            <div className="font-[600]">{row.title}</div>
            <div className="text-[13px] whitespace-pre-wrap">{row.body}</div>
          </div>
        )}
      />
    </PortalShell>
  );
}
