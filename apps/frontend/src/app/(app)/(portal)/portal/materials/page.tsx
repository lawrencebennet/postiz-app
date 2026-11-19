'use client';

import { PortalList, PortalShell } from '@gitroom/frontend/components/neptive/portal';
import { kindLabel } from '@gitroom/frontend/components/neptive/neptive.ui';

export default function Page() {
  return (
    <PortalShell>
      <PortalList
        path="materials"
        eyebrow="Materiali"
        title="File e consegne."
        intro="Documenti, linee guida e materiali condivisi con te."
        empty="Nessun materiale condiviso per ora."
        render={(row) => (
          <div className="flex items-center justify-between gap-[12px] min-w-0">
            <div className="min-w-0">
              <div className="nx-label">{kindLabel(row.kind)}</div>
              <div className="nx-heading text-[18px] mt-[2px] break-words">{row.title}</div>
            </div>
            {row.filePath && (
              <a className="nx-btn shrink-0" data-size="sm" href={row.filePath} target="_blank" rel="noreferrer">
                Apri <span className="nx-arrow" aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        )}
      />
    </PortalShell>
  );
}
