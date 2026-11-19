'use client';

import { PortalList, PortalShell } from '@gitroom/frontend/components/neptive/portal';
import { kindLabel } from '@gitroom/frontend/components/neptive/neptive.ui';

export default function Page() {
  return (
    <PortalShell>
      <PortalList
        path="strategy"
        eyebrow="Strategia"
        title="La direzione."
        intro="Obiettivi, pubblico, tono e priorità che guidano il piano editoriale."
        empty="La strategia non è ancora stata pubblicata."
        render={(row) => (
          <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-[6px] md:gap-[24px]">
            <div className="nx-label pt-[3px]">{kindLabel(row.kind)}</div>
            <div className="min-w-0">
              <div className="nx-heading text-[19px]">{row.title}</div>
              {row.body && (
                <div className="text-[15px] leading-[1.5] mt-[6px] whitespace-pre-wrap text-[var(--nx-text-muted)] break-words">
                  {row.body}
                </div>
              )}
            </div>
          </div>
        )}
      />
    </PortalShell>
  );
}
