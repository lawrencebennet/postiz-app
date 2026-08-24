'use client';

import {
  PortalApprovals,
  PortalShell,
} from '@gitroom/frontend/components/neptive/portal';

export default function Page() {
  return (
    <PortalShell>
      <PortalApprovals />
    </PortalShell>
  );
}
