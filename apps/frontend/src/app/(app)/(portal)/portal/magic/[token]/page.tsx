'use client';

import { PortalMagic } from '@gitroom/frontend/components/neptive/portal';
import { use } from 'react';

export default function Page(props: { params: Promise<{ token: string }> }) {
  const { token } = use(props.params);
  return <PortalMagic token={token} />;
}
