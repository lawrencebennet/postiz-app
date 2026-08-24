'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export const useNeptiveClients = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/neptive/agency/clients')).json();
  }, [fetch]);
  return useSWR('/neptive/agency/clients', load);
};

export const useNeptiveClient = (customerId?: string) => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch(`/neptive/agency/clients/${customerId}`)).json();
  }, [fetch, customerId]);
  return useSWR(
    customerId ? `/neptive/agency/clients/${customerId}` : null,
    load
  );
};

export const useNeptiveAgencyDashboard = (customerId?: string) => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (
      await fetch(`/neptive/agency/clients/${customerId}/dashboard`)
    ).json();
  }, [fetch, customerId]);
  return useSWR(
    customerId ? `/neptive/agency/clients/${customerId}/dashboard` : null,
    load
  );
};

export const useNeptiveAgencyList = (customerId: string, path: string) => {
  const fetch = useFetch();
  const key = `/neptive/agency/clients/${customerId}/${path}`;
  const load = useCallback(async () => {
    return (await fetch(key)).json();
  }, [fetch, key]);
  return useSWR(customerId ? key : null, load);
};

export const useNeptivePortalMe = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const response = await fetch('/neptive/portal/me');
    if (!response.ok) {
      return null;
    }
    return response.json();
  }, [fetch]);
  return useSWR('/neptive/portal/me', load);
};

export const useNeptivePortal = (path: string) => {
  const fetch = useFetch();
  const key = `/neptive/portal/${path}`;
  const load = useCallback(async () => {
    return (await fetch(key)).json();
  }, [fetch, key]);
  return useSWR(key, load);
};
