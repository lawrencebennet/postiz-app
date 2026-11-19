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
      toaster.show('Impossibile creare il cliente', 'warning');
      return;
    }
    const created = await response.json();
    setName('');
    setWebsite('');
    setNotes('');
    await mutate();
    toaster.show('Cliente creato', 'success');
    router.push(`/agency/${created.id}`);
  }, [name, website, notes, fetch, mutate, router, toaster]);

  return (
    <div className="flex flex-col gap-[20px] text-textColor p-[12px] sm:p-[20px]">
      <div className="flex flex-col gap-[6px] px-[4px] pt-[8px]">
        <div className="nx-mono text-[11px] uppercase tracking-[0.06em] text-newTableText">[ Agenzia ]</div>
        <div className="nx-display text-[32px] leading-[1] font-[600] tracking-[-0.02em]">Clienti</div>
        <div className="text-[13px] text-newTableText">
          Piani editoriali, approvazioni e lavoro svolto per cliente. Post e calendario restano nel calendario.
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.8fr] gap-[16px]">
        <NeptiveCard title="Clienti">
          {isLoading && <NeptiveEmpty>Caricamento…</NeptiveEmpty>}
          {!isLoading && !data?.length && (
            <NeptiveEmpty>Nessun cliente. Crea il primo.</NeptiveEmpty>
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
                    {client.channelCount} {client.channelCount === 1 ? 'canale' : 'canali'}
                    {client.website ? ` · ${client.website}` : ''}
                  </div>
                </div>
                <div className="text-[12px] text-newTableText">Apri</div>
              </button>
            ))}
          </div>
        </NeptiveCard>
        <NeptiveCard title="Nuovo cliente">
          <div className="flex flex-col gap-[10px]">
            <NeptiveField label="Ragione sociale">
              <input
                className={fieldClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </NeptiveField>
            <NeptiveField label="Sito web">
              <input
                className={fieldClass}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </NeptiveField>
            <NeptiveField label="Note interne">
              <textarea
                className={areaClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </NeptiveField>
            <Button loading={saving} onClick={create}>
              Crea cliente
            </Button>
          </div>
        </NeptiveCard>
      </div>
    </div>
  );
};
