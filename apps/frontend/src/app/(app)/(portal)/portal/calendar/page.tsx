'use client';

import { PortalList, PortalShell } from '@gitroom/frontend/components/neptive/portal';
import {
  NeptiveBadge,
  formatWhen,
  postPreviewText,
  statusTone,
} from '@gitroom/frontend/components/neptive/neptive.ui';

export default function Page() {
  return (
    <PortalShell>
      <PortalList
        path="content?state=scheduled"
        title="Upcoming content"
        render={(row) => (
          <div>
            <div className="text-[13px] line-clamp-2">
              {postPreviewText(row.content) || 'Scheduled post'}
            </div>
            <div className="text-[12px] text-newTableText">
              {row.integration?.providerIdentifier} · {formatWhen(row.publishDate)}
            </div>
            <NeptiveBadge tone={statusTone(row.state)}>{row.state}</NeptiveBadge>
          </div>
        )}
      />
    </PortalShell>
  );
}
