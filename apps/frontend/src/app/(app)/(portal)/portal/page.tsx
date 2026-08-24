'use client';

import {
  PortalOverview,
  PortalShell,
} from '@gitroom/frontend/components/neptive/portal';

export default function Page() {
  return (
    <PortalShell>
      <PortalOverview />
    </PortalShell>
  );
}
