'use client';

import { PortalList, PortalShell } from '@gitroom/frontend/components/neptive/portal';

export default function Page() {
  return (
    <PortalShell>
      <PortalList
        path="materials"
        title="Materials"
        render={(row) => (
          <div>
            <div className="font-[600]">{row.title}</div>
            <div className="text-[12px] text-newTableText">{row.kind}</div>
            {row.filePath && (
              <a className="text-[12px] underline" href={row.filePath} target="_blank" rel="noreferrer">
                Open
              </a>
            )}
          </div>
        )}
      />
    </PortalShell>
  );
}
