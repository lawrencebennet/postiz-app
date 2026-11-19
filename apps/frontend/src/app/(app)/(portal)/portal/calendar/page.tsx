'use client';

import { PortalList, PortalShell } from '@gitroom/frontend/components/neptive/portal';
import {
  NeptiveBadge,
  formatWhen,
  postPreviewText,
  statusLabel,
  statusTone,
} from '@gitroom/frontend/components/neptive/neptive.ui';

export default function Page() {
  return (
    <PortalShell>
      <PortalList
        path="content?state=scheduled"
        eyebrow="In uscita"
        title="Prossimi post."
        intro="I contenuti approvati e programmati, in ordine di pubblicazione."
        empty="Nessun post programmato."
        render={(row) => (
          <div className="flex items-start justify-between gap-[12px] min-w-0">
            <div className="min-w-0">
              <div className="nx-label">
                {[row.integration?.providerIdentifier, formatWhen(row.publishDate)].filter(Boolean).join(' · ')}
              </div>
              <div className="text-[15px] leading-[1.45] mt-[4px] line-clamp-3 break-words">
                {postPreviewText(row.content) || 'Post programmato'}
              </div>
            </div>
            <NeptiveBadge tone={statusTone(row.state)}>{statusLabel(row.state)}</NeptiveBadge>
          </div>
        )}
      />
    </PortalShell>
  );
}
