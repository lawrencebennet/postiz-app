import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { AttributionComponent } from '@gitroom/frontend/components/auth/attribution.component';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Toaster } from '@gitroom/react/toaster/toaster';
// Neptive: the visible frame of the auth pages is a Neptive component (no upstream marketing panel)
import { NeptiveAuthShell } from '@gitroom/frontend/components/neptive/brand/auth-shell';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getT();

  return (
    <MantineWrapper>
      <Toaster />
      <ReturnUrlComponent />
      <AttributionComponent />
      <NeptiveAuthShell>{children}</NeptiveAuthShell>
    </MantineWrapper>
  );
}
