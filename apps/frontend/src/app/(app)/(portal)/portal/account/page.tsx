'use client';

import { PortalHeader, PortalShell } from '@gitroom/frontend/components/neptive/portal';
import { PortalAccount } from '@gitroom/frontend/components/neptive/portal-account';

export default function Page() {
  return (
    <PortalShell>
      <PortalAccount header={<PortalHeader eyebrow="Account" title="Il tuo account." />} />
    </PortalShell>
  );
}
