'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@gitroom/react/form/button';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useNeptiveClients } from '@gitroom/frontend/components/neptive/neptive.hooks';
import {
  NeptiveCard,
  NeptiveEmpty,
  NeptiveField,
  fieldClass,
  areaClass,
} from '@gitroom/frontend/components/neptive/neptive.ui';
import { useToaster } from '@gitroom/react/toaster/toaster';

export const AgencyHome = () => {
  const { data, mutate, isLoading } = useNeptiveClients();
  const fetch = useFetch();
  const router = useRouter();
  const toaster = useToaster();
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const create = useCallback(async () => {
    if (!name.trim()) {
      return;
    }
    setSaving(true);
    const response = await fetch('/neptive/agency/clients', {
      method: 'POST',
      body: JSON.stringify({ name, website, notes }),
    });
    setSaving(false);
    if (!response.ok) {
      toaster.show('Could not create client', 'warning');
      return;
    }
    const created = await response.json();
    setName('');
    setWebsite('');
    setNotes('');
    await mutate();
    toaster.show('Client created', 'success');
    router.push(`/agency/${created.id}`);
  }, [name, website, notes, fetch, mutate, router, toaster]);

  return (
    <div className="flex flex-col gap-[20px] text-textColor">
      <div>
        <div className="text-[24px] font-[700]">Agency</div>
        <div className="text-[13px] text-newTableText">
          Clients, editorial plans, approvals, and work performed. Composer and
          calendar stay in Postiz.
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.8fr] gap-[16px]">
        <NeptiveCard title="Clients">
          {isLoading && <NeptiveEmpty>Loading…</NeptiveEmpty>}
          {!isLoading && !data?.length && (
            <NeptiveEmpty>No clients yet. Create the first one.</NeptiveEmpty>
          )}
          <div className="flex flex-col gap-[8px]">
            {(data || []).map((client: any) => (
              <button
                key={client.id}
                onClick={() => router.push(`/agency/${client.id}`)}
                className="flex items-center justify-between px-[12px] py-[10px] rounded-[8px] hover:bg-newBoxHover text-left"
              >
                <div>
                  <div className="font-[600]">{client.name}</div>
                  <div className="text-[12px] text-newTableText">
                    {client.channelCount} channels
                    {client.website ? ` · ${client.website}` : ''}
                  </div>
                </div>
                <div className="text-[12px] text-newTableText">Open</div>
              </button>
            ))}
          </div>
        </NeptiveCard>
        <NeptiveCard title="New client">
          <div className="flex flex-col gap-[10px]">
            <NeptiveField label="Company name">
              <input
                className={fieldClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </NeptiveField>
            <NeptiveField label="Website">
              <input
                className={fieldClass}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </NeptiveField>
            <NeptiveField label="Internal notes">
              <textarea
                className={areaClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </NeptiveField>
            <Button loading={saving} onClick={create}>
              Create client
            </Button>
          </div>
        </NeptiveCard>
      </div>
    </div>
  );
};
