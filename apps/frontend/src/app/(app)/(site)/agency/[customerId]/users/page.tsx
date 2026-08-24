export const dynamic = 'force-dynamic';
import { AgencyClientPage } from '@gitroom/frontend/components/neptive/agency.client';

export default async function Page(props: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await props.params;
  return <AgencyClientPage customerId={customerId} section="users" />;
}
