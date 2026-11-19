'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@gitroom/react/form/button';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  useNeptiveAgencyDashboard,
  useNeptiveAgencyList,
  useNeptiveClient,
} from '@gitroom/frontend/components/neptive/neptive.hooks';
import {
  NeptiveBadge,
  NeptiveCard,
  NeptiveEmpty,
  NeptiveField,
  areaClass,
  fieldClass,
  formatWhen,
  nextApprovalActions,
  nextPedActions,
  postPreviewText,
  statusLabel,
  statusTone,
} from '@gitroom/frontend/components/neptive/neptive.ui';
import { useToaster } from '@gitroom/react/toaster/toaster';
import clsx from 'clsx';
import {
  PedCalendar,
  PedContentList,
  pedSummary,
} from '@gitroom/frontend/components/neptive/ped-calendar';
import {
  PedCalendarItem,
  PedContentCard,
} from '@gitroom/frontend/components/neptive/ped-content-card';
import { PedContentDetail } from '@gitroom/frontend/components/neptive/ped-content-detail';
import { attachOptionsFromPosts } from '@gitroom/frontend/components/neptive/ped-variants';

const TABS = [
  { href: '', label: 'Panoramica' },
  { href: '/ped', label: 'PED' },
  { href: '/content', label: 'Contenuti' },
  { href: '/approvals', label: 'Approvazioni' },
  { href: '/strategy', label: 'Strategia' },
  { href: '/activities', label: 'Attività' },
  { href: '/materials', label: 'Materiali' },
  { href: '/analytics', label: 'Analisi' },
  { href: '/reports', label: 'Report' },
  { href: '/users', label: 'Utenti cliente' },
];

export const AgencyClientShell = ({
  customerId,
  section,
}: {
  customerId: string;
  section: string;
}) => {
  const { data: client } = useNeptiveClient(customerId);
  const pathname = usePathname();
  const base = `/agency/${customerId}`;
  return (
    <div className="flex flex-col gap-[16px] text-textColor p-[12px] sm:p-[20px]">
      <div className="flex items-end justify-between gap-[12px] px-[4px] pt-[8px]">
        <div className="flex flex-col gap-[6px]">
          <Link href="/agency" className="nx-mono text-[11px] uppercase tracking-[0.06em] text-newTableText hover:text-textColor">
            ← Tutti i clienti
          </Link>
          <div className="nx-display text-[32px] leading-[1] font-[600] tracking-[-0.02em]">{client?.name || 'Cliente'}</div>
        </div>
        <Link
          href="/launches"
          className="text-[13px] px-[12px] h-[40px] flex items-center rounded-[8px] bg-newBtnSimple"
        >
          Apri il calendario
        </Link>
      </div>
      <div className="flex flex-wrap gap-[6px]">
        {TABS.map((tab) => {
          const href = `${base}${tab.href}`;
          const active =
            tab.href === ''
              ? pathname === base
              : pathname.startsWith(href);
          return (
            <Link
              key={tab.href}
              href={href}
              className={clsx(
                'px-[10px] py-[6px] rounded-[8px] text-[12px] font-[600]',
                active
                  ? 'bg-boxFocused text-textItemFocused'
                  : 'text-newTableText hover:bg-newBoxHover'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {section === 'overview' && <OverviewPanel customerId={customerId} />}
      {section === 'ped' && <PedPanel customerId={customerId} />}
      {section === 'content' && <ContentPanel customerId={customerId} />}
      {section === 'approvals' && <ApprovalsPanel customerId={customerId} />}
      {section === 'strategy' && <StrategyPanel customerId={customerId} />}
      {section === 'activities' && <ActivitiesPanel customerId={customerId} />}
      {section === 'materials' && <MaterialsPanel customerId={customerId} />}
      {section === 'analytics' && <AnalyticsPanel customerId={customerId} />}
      {section === 'reports' && <ReportsPanel customerId={customerId} />}
      {section === 'users' && <UsersPanel customerId={customerId} />}
    </div>
  );
};

const OverviewPanel = ({ customerId }: { customerId: string }) => {
  const { data } = useNeptiveAgencyDashboard(customerId);
  const upcoming = Array.isArray(data?.upcoming)
    ? data.upcoming
    : data?.upcoming?.posts || [];
  return (
    <div className="flex flex-col gap-[12px]">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[12px]">
      <NeptiveCard title="PED in corso">
        {data?.currentPed ? (
          <div>
            <div className="font-[600]">{data.currentPed.name}</div>
            <NeptiveBadge tone={statusTone(data.currentPed.status)}>
              {statusLabel(data.currentPed.status)}
            </NeptiveBadge>
          </div>
        ) : (
          <NeptiveEmpty>Nessun piano editoriale</NeptiveEmpty>
        )}
      </NeptiveCard>
      <NeptiveCard title="In attesa del cliente">
        <div className="text-[28px] font-[700]">
          {data?.awaitingApproval ?? 0}
        </div>
      </NeptiveCard>
      <NeptiveCard title="Ultimo report">
        {data?.latestReport ? (
          <div>{data.latestReport.title}</div>
        ) : (
          <NeptiveEmpty>Nessun report</NeptiveEmpty>
        )}
      </NeptiveCard>
      <NeptiveCard title="In uscita">
        {upcoming.slice(0, 6).map((item: any) => (
          <div key={item.id} className="text-[13px] py-[4px] border-b border-newTableBorder last:border-0">
            <div className="line-clamp-2">{postPreviewText(item.content) || 'Post programmato'}</div>
            <div className="text-[11px] text-newTableText">
              {item.integration?.providerIdentifier} · {formatWhen(item.publishDate)}
            </div>
          </div>
        ))}
        {!upcoming.length && <NeptiveEmpty>Niente in coda</NeptiveEmpty>}
      </NeptiveCard>
      <NeptiveCard title="Lavoro recente" className="md:col-span-2">
        {(data?.recentActivities || []).slice(0, 6).map((item: any) => (
          <div key={item.id} className="text-[13px] py-[4px]">
            {item.title}
          </div>
        ))}
        {!data?.recentActivities?.length && (
          <NeptiveEmpty>Nessuna attività registrata</NeptiveEmpty>
        )}
      </NeptiveCard>
      </div>
      <PreviewIdentityPanel customerId={customerId} />
    </div>
  );
};

const PreviewIdentityPanel = ({ customerId }: { customerId: string }) => {
  const { data: client, mutate } = useNeptiveClient(customerId);
  const fetch = useFetch();
  const toaster = useToaster();
  const [values, setValues] = useState({
    instagramName: '',
    instagramImage: '',
    facebookName: '',
    facebookImage: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const identity = client?.previewIdentity;
    if (!identity) return;
    setValues({
      instagramName: identity.instagram?.name || '',
      instagramImage: identity.instagram?.image || '',
      facebookName: identity.facebook?.name || '',
      facebookImage: identity.facebook?.image || '',
    });
  }, [client?.previewIdentity]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch(`/neptive/agency/clients/${customerId}/preview-identity`, {
        method: 'PUT',
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        toaster.show('Impossibile salvare l’identità preview', 'warning');
        return;
      }
      await mutate();
      toaster.show('Identità preview salvata', 'success');
    } finally {
      setSaving(false);
    }
  }, [customerId, fetch, mutate, toaster, values]);

  return (
    <NeptiveCard title="Identità delle anteprime">
      <div className="mb-[12px] text-[12px] text-newTableText">Configura il nome e l’immagine che il cliente vedrà nei mockup Instagram e Facebook. Non modifica gli account Neptive né le credenziali social.</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[12px]">
        <NeptiveField label="Nome profilo Instagram"><input className={fieldClass} value={values.instagramName} onChange={(e) => setValues((current) => ({ ...current, instagramName: e.target.value }))} placeholder="Casa Pandora" /></NeptiveField>
        <NeptiveField label="Immagine profilo Instagram (URL)"><input className={fieldClass} value={values.instagramImage} onChange={(e) => setValues((current) => ({ ...current, instagramImage: e.target.value }))} placeholder="https://…" /></NeptiveField>
        <NeptiveField label="Nome pagina Facebook"><input className={fieldClass} value={values.facebookName} onChange={(e) => setValues((current) => ({ ...current, facebookName: e.target.value }))} placeholder="Casa Pandora" /></NeptiveField>
        <NeptiveField label="Immagine pagina Facebook (URL)"><input className={fieldClass} value={values.facebookImage} onChange={(e) => setValues((current) => ({ ...current, facebookImage: e.target.value }))} placeholder="https://…" /></NeptiveField>
      </div>
      <div className="mt-[12px]"><Button onClick={save} disabled={saving}>{saving ? 'Salvataggio…' : 'Salva identità preview'}</Button></div>
    </NeptiveCard>
  );
};

const PedPanel = ({ customerId }: { customerId: string }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, mutate } = useNeptiveAgencyList(customerId, 'peds');
  const { data: postsData } = useNeptiveAgencyList(customerId, 'posts?state=all');
  const { data: client } = useNeptiveClient(customerId);
  const [name, setName] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [objectives, setObjectives] = useState('');
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [itemGroups, setItemGroups] = useState<Record<string, string>>({});
  // keep only ids: the open slot is re-read from fresh data after every change
  const [selected, setSelected] = useState<{ planId: string; itemId: string } | null>(null);
  const selectedPed = (data || []).find((ped: any) => ped.id === selected?.planId);
  const selectedItem: PedCalendarItem | null =
    (selectedPed?.items || []).find((item: any) => item.id === selected?.itemId) || null;
  const attachOptions = attachOptionsFromPosts(postsData?.posts || []);

  const postGroups = Array.from(
    new Map(
      (postsData?.posts || [])
        .filter((post: any) => post.group && post.state !== 'PUBLISHED')
        .map((post: any) => [post.group, post])
    ).values()
  );

  const create = useCallback(async () => {
    const response = await fetch(`/neptive/agency/clients/${customerId}/peds`, {
      method: 'POST',
      body: JSON.stringify({ name, periodStart, periodEnd, objectives }),
    });
    if (!response.ok) {
      toaster.show('Impossibile creare il PED', 'warning');
      return;
    }
    setName('');
    setObjectives('');
    await mutate();
  }, [fetch, customerId, name, periodStart, periodEnd, objectives, mutate, toaster]);

  const transition = useCallback(
    async (id: string, status: string, needsComment?: boolean) => {
      let comment: string | undefined;
      if (needsComment) {
        comment = window.prompt('Commento richiesto') || '';
        if (!comment.trim()) {
          toaster.show('Un commento è obbligatorio', 'warning');
          return;
        }
      }
      const response = await fetch(
        `/neptive/agency/clients/${customerId}/peds/${id}/transition`,
        { method: 'POST', body: JSON.stringify({ status, comment }) }
      );
      if (!response.ok) {
        toaster.show('Passaggio non ancora disponibile', 'warning');
        return;
      }
      await mutate();
    },
    [fetch, customerId, mutate, toaster]
  );

  const addItem = useCallback(
    async (id: string) => {
      const title = (itemDrafts[id] || '').trim();
      if (!title) {
        return;
      }
      const response = await fetch(
        `/neptive/agency/clients/${customerId}/peds/${id}/items`,
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            postGroup: itemGroups[id] || undefined,
          }),
        }
      );
      if (!response.ok) {
        toaster.show('Impossibile aggiungere il contenuto', 'warning');
        return;
      }
      setItemDrafts((current) => ({ ...current, [id]: '' }));
      setItemGroups((current) => ({ ...current, [id]: '' }));
      await mutate();
    },
    [fetch, customerId, itemDrafts, mutate, toaster]
  );

  const removeItem = useCallback(
    async (id: string, itemId: string) => {
      await fetch(
        `/neptive/agency/clients/${customerId}/peds/${id}/items/${itemId}`,
        { method: 'DELETE' }
      );
      await mutate();
    },
    [fetch, customerId, mutate]
  );

  return (
    <div className="flex flex-col gap-[12px]">
      {(data || []).map((ped: any) => {
        const items = (ped.items || []) as PedCalendarItem[];
        const summary = pedSummary(items);
        return (
          <div key={ped.id} className="flex flex-col gap-[12px]">
            <NeptiveCard>
              <div className="flex items-start justify-between gap-[12px] flex-wrap">
                <div>
                  <div className="text-[11px] text-newTableText uppercase tracking-[0.08em]">Piano editoriale</div>
                  <div className="text-[22px] font-[700]">{ped.name}</div>
                  <div className="text-[12px] text-newTableText">{ped.periodStart?.slice(0, 10)} → {ped.periodEnd?.slice(0, 10)}</div>
                </div>
                <NeptiveBadge tone={statusTone(ped.status)}>{statusLabel(ped.status)}</NeptiveBadge>
              </div>
              {ped.objectives && <div className="text-[13px] mt-[10px] whitespace-pre-wrap">{ped.objectives}</div>}
              <div className="flex flex-wrap gap-[6px] mt-[12px]">
                <NeptiveBadge>{summary.total} contenuti</NeptiveBadge>
                <NeptiveBadge>{summary.carousels} caroselli</NeptiveBadge>
                <NeptiveBadge>{summary.reels} reel</NeptiveBadge>
                <NeptiveBadge>{summary.posts} post</NeptiveBadge>
                <NeptiveBadge>{summary.stories} stories</NeptiveBadge>
              </div>
              <div className="flex gap-[6px] mt-[12px] flex-wrap">
                {nextPedActions(ped.status).map((action) => (
                  <button key={action.status} className="text-[11px] px-[8px] h-[28px] rounded-[6px] bg-newBtnSimple" onClick={() => transition(ped.id, action.status, action.needsComment)}>{action.label}</button>
                ))}
              </div>
            </NeptiveCard>
            <PedCalendar items={items} periodStart={ped.periodStart} periodEnd={ped.periodEnd} onOpen={(item) => setSelected({ planId: ped.id, itemId: item.id })} />
            <PedContentList items={items} onOpen={(item) => setSelected({ planId: ped.id, itemId: item.id })} />
            <NeptiveCard title="Contenuti collegati">
              <div className="text-[12px] text-newTableText mb-[8px]">Apri un contenuto per vedere le sue varianti (A, B, C…), le decisioni del cliente e per aggiungere, rinominare, riordinare, rimuovere varianti o riaprire una scelta.</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-[8px]">
                {items.map((item) => <PedContentCard key={item.id} item={item} onOpen={(entry) => setSelected({ planId: ped.id, itemId: entry.id })} />)}
              </div>
              {!items.length && <NeptiveEmpty>Aggiungi il primo contenuto Neptive a questo PED.</NeptiveEmpty>}
            </NeptiveCard>
            <NeptiveCard title="Aggiungi contenuto dal calendario Neptive">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-[8px] items-end">
                <NeptiveField label="Titolo editoriale">
                  <input className={fieldClass} placeholder="Es. Camera Deluxe" value={itemDrafts[ped.id] || ''} onChange={(e) => setItemDrafts((current) => ({ ...current, [ped.id]: e.target.value }))} />
                </NeptiveField>
                <NeptiveField label="Contenuto Neptive">
                  <select className={fieldClass} value={itemGroups[ped.id] || ''} onChange={(e) => setItemGroups((current) => ({ ...current, [ped.id]: e.target.value }))}>
                    <option value="">Seleziona un draft Neptive</option>
                    {postGroups.map((post: any) => <option key={post.group} value={post.group}>{postPreviewText(post.content) || 'Contenuto senza titolo'} · {post.state}</option>)}
                  </select>
                </NeptiveField>
                <Button onClick={() => addItem(ped.id)}>+ Aggiungi</Button>
              </div>
              <div className="text-[12px] text-newTableText mt-[8px]">Caption, media, ordine, canale, data e stato restano gestiti dal composer/calendario Neptive.</div>
            </NeptiveCard>
          </div>
        );
      })}
      {!data?.length && <NeptiveCard title="Piani editoriali"><NeptiveEmpty>Nessun PED</NeptiveEmpty></NeptiveCard>}
      <NeptiveCard title="Nuovo PED">
        <div className="flex flex-col gap-[8px]">
          <NeptiveField label="Nome">
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
          </NeptiveField>
          <NeptiveField label="Inizio">
            <input className={fieldClass} type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </NeptiveField>
          <NeptiveField label="Fine">
            <input className={fieldClass} type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </NeptiveField>
          <NeptiveField label="Obiettivi">
            <textarea className={areaClass} value={objectives} onChange={(e) => setObjectives(e.target.value)} />
          </NeptiveField>
          <Button onClick={create}>Crea PED</Button>
        </div>
      </NeptiveCard>
      <PedContentDetail
        item={selectedItem}
        mode="agency"
        previewIdentity={client?.previewIdentity}
        onClose={() => setSelected(null)}
        onChanged={mutate}
        agency={
          selected
            ? {
                customerId,
                planId: selected.planId,
                attachOptions,
                onChanged: mutate,
                notify: (message, kind) => toaster.show(message, kind || 'success'),
              }
            : undefined
        }
      />
    </div>
  );
};

const ContentPanel = ({ customerId }: { customerId: string }) => {
  const { data } = useNeptiveAgencyList(customerId, 'posts?state=all');
  const posts = data?.posts || [];
  return (
    <NeptiveCard title="Post del cliente (dal calendario)">
      <div className="text-[12px] text-newTableText mb-[8px]">
        Publishing state is owned by Neptive. Use Approvals for client sign-off.
      </div>
      {posts.map((post: any) => (
        <div key={post.id} className="flex justify-between py-[8px] border-b border-newTableBorder gap-[12px]">
          <div>
            <div className="text-[13px] line-clamp-2">
              {postPreviewText(post.content) || 'Post senza titolo'}
            </div>
            <div className="text-[11px] text-newTableText">
              {post.integration?.providerIdentifier} · {formatWhen(post.publishDate)}
            </div>
          </div>
          <NeptiveBadge tone={statusTone(post.state)}>{statusLabel(post.state)}</NeptiveBadge>
        </div>
      ))}
      {!posts.length && <NeptiveEmpty>Nessun post per questo cliente</NeptiveEmpty>}
    </NeptiveCard>
  );
};

const ApprovalsPanel = ({ customerId }: { customerId: string }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, mutate } = useNeptiveAgencyList(customerId, 'approvals');
  const { data: postsData } = useNeptiveAgencyList(customerId, 'posts?state=all');
  const [postGroup, setPostGroup] = useState('');
  const posts = postsData?.posts || [];
  const groups: any[] = [];
  const seen = new Set<string>();
  for (const post of posts) {
    if (!post.group || seen.has(post.group) || post.state === 'PUBLISHED') {
      continue;
    }
    seen.add(post.group);
    groups.push(post);
  }

  const create = useCallback(async () => {
    if (!postGroup) return;
    const selected = groups.find((post: any) => post.group === postGroup);
    const response = await fetch(
      `/neptive/agency/clients/${customerId}/approvals`,
      {
        method: 'POST',
        body: JSON.stringify({
          postGroup,
          title: postPreviewText(selected?.content) || undefined,
        }),
      }
    );
    if (!response.ok) {
      toaster.show('Impossibile avviare l’approvazione', 'warning');
      return;
    }
    setPostGroup('');
    await mutate();
  }, [fetch, customerId, postGroup, groups, mutate, toaster]);

  const transition = useCallback(
    async (id: string, status: string, needsComment?: boolean) => {
      let comment: string | undefined;
      if (needsComment) {
        comment = window.prompt('Commento (obbligatorio)') || '';
        if (!comment.trim()) {
          toaster.show('A comment is required', 'warning');
          return;
        }
      }
      const response = await fetch(
        `/neptive/agency/clients/${customerId}/approvals/${id}/transition`,
        { method: 'POST', body: JSON.stringify({ status, comment }) }
      );
      if (!response.ok) {
        toaster.show('Passaggio non riuscito', 'warning');
        return;
      }
      await mutate();
    },
    [fetch, customerId, mutate, toaster]
  );

  return (
    <div className="flex flex-col gap-[12px]">
      <NeptiveCard title="Invia una bozza in approvazione">
        <div className="flex gap-[8px]">
          <select
            className={fieldClass}
            value={postGroup}
            onChange={(e) => setPostGroup(e.target.value)}
          >
            <option value="">Scegli un post</option>
            {groups.map((post: any) => (
              <option key={post.group} value={post.group}>
                {(postPreviewText(post.content) || 'Senza titolo').slice(0, 80)} · {post.state}
              </option>
            ))}
          </select>
          <Button onClick={create}>Crea approvazione</Button>
        </div>
      </NeptiveCard>
      <NeptiveCard title="Approvazioni">
        {(data || []).map((row: any) => (
          <div key={row.id} className="py-[12px] border-b border-newTableBorder">
            <div className="flex items-center gap-[8px] flex-wrap">
              <div className="font-[600]">
                {row.title || row.post?.text || 'Contenuto da approvare'}
              </div>
              <NeptiveBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</NeptiveBadge>
            </div>
            {row.post?.text && row.title && row.title !== row.post.text && (
              <div className="text-[13px] mt-[4px] line-clamp-2">{row.post.text}</div>
            )}
            <div className="text-[12px] text-newTableText mt-[4px]">
              {[row.post?.provider, row.post?.state, formatWhen(row.post?.publishDate)]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {(row.comments || []).slice(-3).map((item: any) => (
              <div key={item.id} className="text-[12px] py-[2px] text-newTableText">
                {item.authorName}: {item.body}
              </div>
            ))}
            <div className="flex gap-[6px] mt-[8px] flex-wrap">
              {nextApprovalActions(row.status).map((action) => (
                <button
                  key={action.status}
                  className="text-[11px] px-[8px] h-[28px] rounded-[6px] bg-newBtnSimple"
                  onClick={() =>
                    transition(row.id, action.status, action.needsComment)
                  }
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!data?.length && <NeptiveEmpty>Nessuna approvazione</NeptiveEmpty>}
      </NeptiveCard>
    </div>
  );
};

const StrategyPanel = ({ customerId }: { customerId: string }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, mutate } = useNeptiveAgencyList(customerId, 'strategy');
  const [kind, setKind] = useState('OBJECTIVE');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState('CLIENT_VISIBLE');

  const create = useCallback(async () => {
    if (!title.trim()) {
      return;
    }
    const response = await fetch(`/neptive/agency/clients/${customerId}/strategy`, {
      method: 'POST',
      body: JSON.stringify({ kind, title, body, visibility }),
    });
    if (!response.ok) {
      toaster.show('Impossibile salvare la voce di strategia', 'warning');
      return;
    }
    setTitle('');
    setBody('');
    await mutate();
  }, [fetch, customerId, kind, title, body, visibility, mutate, toaster]);

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/neptive/agency/clients/${customerId}/strategy/${id}`, {
        method: 'DELETE',
      });
      await mutate();
    },
    [fetch, customerId, mutate]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[12px]">
      <NeptiveCard title="Strategia">
        {(data || []).map((entry: any) => (
          <div key={entry.id} className="py-[10px] border-b border-newTableBorder">
            <div className="flex items-center justify-between gap-[8px]">
              <div className="text-[11px] text-newTableText">{entry.kind} · {entry.visibility}</div>
              <button className="text-[11px] text-newTableText" onClick={() => remove(entry.id)}>
                Rimuovi
              </button>
            </div>
            <div className="font-[600]">{entry.title}</div>
            <div className="text-[13px] whitespace-pre-wrap">{entry.body}</div>
          </div>
        ))}
        {!data?.length && <NeptiveEmpty>Nessuna voce di strategia</NeptiveEmpty>}
      </NeptiveCard>
      <NeptiveCard title="Aggiungi voce">
        <div className="flex flex-col gap-[8px]">
          <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            {['OBJECTIVE','AUDIENCE','POSITIONING','PILLAR','TONE','PLATFORM','PRIORITY','EXPERIMENT','CAMPAIGN','KPI','NOTE'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input className={fieldClass} placeholder="Titolo" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className={areaClass} placeholder="Testo" value={body} onChange={(e) => setBody(e.target.value)} />
          <select className={fieldClass} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="CLIENT_VISIBLE">Visibile al cliente</option>
            <option value="INTERNAL">Solo interno</option>
          </select>
          <Button onClick={create}>Salva</Button>
        </div>
      </NeptiveCard>
    </div>
  );
};

const ActivitiesPanel = ({ customerId }: { customerId: string }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, mutate } = useNeptiveAgencyList(customerId, 'activities');
  const [type, setType] = useState('MEETING');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState('CLIENT_VISIBLE');

  const create = useCallback(async () => {
    if (!title.trim()) {
      return;
    }
    const response = await fetch(`/neptive/agency/clients/${customerId}/activities`, {
      method: 'POST',
      body: JSON.stringify({ type, title, body, visibility }),
    });
    if (!response.ok) {
      toaster.show('Impossibile registrare l’attività', 'warning');
      return;
    }
    setTitle('');
    setBody('');
    await mutate();
  }, [fetch, customerId, type, title, body, visibility, mutate, toaster]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[12px]">
      <NeptiveCard title="Lavoro svolto">
        {(data || []).map((item: any) => (
          <div key={item.id} className="py-[8px] border-b border-newTableBorder">
            <div className="text-[11px] text-newTableText">{item.type} · {item.source} · {item.visibility}</div>
            <div className="font-[600]">{item.title}</div>
            {item.body && <div className="text-[13px]">{item.body}</div>}
            <div className="text-[11px] text-newTableText">{formatWhen(item.occurredAt)}</div>
          </div>
        ))}
        {!data?.length && <NeptiveEmpty>Nessuna attività</NeptiveEmpty>}
      </NeptiveCard>
      <NeptiveCard title="Registra attività">
        <div className="flex flex-col gap-[8px]">
          <select className={fieldClass} value={type} onChange={(e) => setType(e.target.value)}>
            {['PROFILE_OPTIMIZATION','COMPETITOR_ANALYSIS','CAMPAIGN_ADJUSTMENT','MEETING','CREATIVE_PRODUCTION','STRATEGY_UPDATE','REPORT_PREPARATION','WEBSITE_SOCIAL_INTERVENTION','OTHER'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input className={fieldClass} placeholder="Titolo" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className={areaClass} value={body} onChange={(e) => setBody(e.target.value)} />
          <select className={fieldClass} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="CLIENT_VISIBLE">Visibile al cliente</option>
            <option value="INTERNAL">Solo interno</option>
          </select>
          <Button onClick={create}>Registra</Button>
        </div>
      </NeptiveCard>
    </div>
  );
};

const MaterialsPanel = ({ customerId }: { customerId: string }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, mutate } = useNeptiveAgencyList(customerId, 'materials');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('DELIVERABLE');
  const [filePath, setFilePath] = useState('');
  const [visibility, setVisibility] = useState('CLIENT_VISIBLE');

  const create = useCallback(async () => {
    if (!title.trim()) {
      return;
    }
    const response = await fetch(`/neptive/agency/clients/${customerId}/materials`, {
      method: 'POST',
      body: JSON.stringify({ title, kind, filePath, visibility }),
    });
    if (!response.ok) {
      toaster.show('Impossibile salvare il materiale', 'warning');
      return;
    }
    setTitle('');
    setFilePath('');
    await mutate();
  }, [fetch, customerId, title, kind, filePath, visibility, mutate, toaster]);

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/neptive/agency/clients/${customerId}/materials/${id}`, {
        method: 'DELETE',
      });
      await mutate();
    },
    [fetch, customerId, mutate]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[12px]">
      <NeptiveCard title="Materiali">
        {(data || []).map((item: any) => (
          <div key={item.id} className="py-[8px] border-b border-newTableBorder">
            <div className="flex items-center justify-between gap-[8px]">
              <div className="font-[600]">{item.title}</div>
              <button className="text-[11px] text-newTableText" onClick={() => remove(item.id)}>
                Rimuovi
              </button>
            </div>
            <div className="text-[12px] text-newTableText">{item.kind} · {item.visibility}</div>
            {item.filePath && (
              <a className="text-[12px] underline" href={item.filePath} target="_blank" rel="noreferrer">
                Apri
              </a>
            )}
          </div>
        ))}
        {!data?.length && <NeptiveEmpty>Nessun materiale</NeptiveEmpty>}
      </NeptiveCard>
      <NeptiveCard title="Aggiungi materiale">
        <div className="flex flex-col gap-[8px]">
          <input className={fieldClass} placeholder="Titolo" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            {['BRAND_GUIDELINES','REPORT_PDF','STRATEGY_DOCUMENT','RAW_PHOTO','CLIENT_MATERIAL','CAMPAIGN_ASSET','DELIVERABLE'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input className={fieldClass} placeholder="URL del file o percorso media" value={filePath} onChange={(e) => setFilePath(e.target.value)} />
          <select className={fieldClass} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="CLIENT_VISIBLE">Visibile al cliente</option>
            <option value="INTERNAL">Solo interno</option>
          </select>
          <Button onClick={create}>Salva</Button>
        </div>
      </NeptiveCard>
    </div>
  );
};

const AnalyticsPanel = ({ customerId }: { customerId: string }) => {
  const { data } = useNeptiveAgencyList(customerId, 'analytics?date=30');
  return (
    <NeptiveCard title="Analisi dei canali">
      {(data || []).map((row: any) => (
        <div key={row.integrationId} className="py-[8px] border-b border-newTableBorder">
          <div className="font-[600]">{row.name} · {row.provider}</div>
          <div className="text-[12px] text-newTableText">
            {Array.isArray(row.data) ? `${row.data.length} series` : 'Nessun dato'}
          </div>
        </div>
      ))}
      {!data?.length && <NeptiveEmpty>Nessun canale collegato</NeptiveEmpty>}
    </NeptiveCard>
  );
};

const ReportsPanel = ({ customerId }: { customerId: string }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, mutate } = useNeptiveAgencyList(customerId, 'reports');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [narrative, setNarrative] = useState('');

  const generate = useCallback(async () => {
    if (!periodStart || !periodEnd) {
      toaster.show('Scegli data di inizio e di fine', 'warning');
      return;
    }
    const response = await fetch(`/neptive/agency/clients/${customerId}/reports`, {
      method: 'POST',
      body: JSON.stringify({ periodStart, periodEnd, narrative }),
    });
    if (!response.ok) {
      toaster.show('Impossibile generare il report', 'warning');
      return;
    }
    setNarrative('');
    await mutate();
  }, [fetch, customerId, periodStart, periodEnd, narrative, mutate, toaster]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[12px]">
      <NeptiveCard title="Report">
        {(data || []).map((report: any) => {
          const snapshot = report.snapshot || {};
          return (
            <div key={report.id} className="py-[10px] border-b border-newTableBorder">
              <div className="font-[600]">{report.title}</div>
              <div className="flex items-center gap-[8px] mt-[4px]">
                <NeptiveBadge tone={statusTone(report.status)}>{statusLabel(report.status)}</NeptiveBadge>
                <span className="text-[12px] text-newTableText">
                  {report.periodStart?.slice(0, 10)} → {report.periodEnd?.slice(0, 10)}
                </span>
              </div>
              {report.narrative && (
                <div className="text-[13px] mt-[8px] whitespace-pre-wrap">{report.narrative}</div>
              )}
              <div className="text-[13px] mt-[8px] grid grid-cols-3 gap-[8px]">
                <div>Published {snapshot.publishedCount ?? 0}</div>
                <div>Work logged {snapshot.activitiesPerformed ?? 0}</div>
                <div>
                  Approvals{' '}
                  {(snapshot.approvals || [])
                    .map((row: any) => `${row.status}: ${row.count}`)
                    .join(', ') || 'none'}
                </div>
              </div>
              {!!snapshot.objectives?.length && (
                <div className="text-[12px] text-newTableText mt-[6px]">
                  Objectives: {snapshot.objectives.join(', ')}
                </div>
              )}
            </div>
          );
        })}
        {!data?.length && <NeptiveEmpty>Nessun report</NeptiveEmpty>}
      </NeptiveCard>
      <NeptiveCard title="Genera il riepilogo mensile">
        <div className="flex flex-col gap-[8px]">
          <input className={fieldClass} type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          <input className={fieldClass} type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          <textarea className={areaClass} placeholder="Commento" value={narrative} onChange={(e) => setNarrative(e.target.value)} />
          <Button onClick={generate}>Pubblica report</Button>
        </div>
      </NeptiveCard>
    </div>
  );
};

const UsersPanel = ({ customerId }: { customerId: string }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, mutate } = useNeptiveClient(customerId);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');

  const invite = useCallback(async () => {
    const response = await fetch(
      `/neptive/agency/clients/${customerId}/users`,
      { method: 'POST', body: JSON.stringify({ email, name }) }
    );
    const body = await response.json();
    await mutate();
    if (!response.ok) {
      toaster.show('Impossibile creare l’invito', 'warning');
      return;
    }
    if (body.url) {
      setInviteUrl(body.url);
      toaster.show('Invito creato', 'success');
      try {
        await navigator.clipboard.writeText(body.url);
      } catch {}
    }
    setEmail('');
    setName('');
  }, [fetch, customerId, email, name, mutate, toaster]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[12px]">
      <NeptiveCard title="Utenti cliente">
        {(data?.users || []).map((user: any) => (
          <div key={user.id} className="py-[8px] border-b border-newTableBorder">
            <div className="font-[600]">{user.name}</div>
            <div className="text-[12px] text-newTableText">{user.email} · {user.role}</div>
          </div>
        ))}
        {!data?.users?.length && <NeptiveEmpty>Nessun utente cliente</NeptiveEmpty>}
      </NeptiveCard>
      <NeptiveCard title="Invita">
        <div className="flex flex-col gap-[8px]">
          <input className={fieldClass} placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={fieldClass} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button onClick={invite}>Invia link di accesso</Button>
          {inviteUrl && (
            <div className="text-[12px] break-all text-newTableText">
              {inviteUrl}
            </div>
          )}
        </div>
      </NeptiveCard>
    </div>
  );
};

export const AgencyClientPage = ({
  customerId,
  section,
}: {
  customerId: string;
  section: string;
}) => {
  return <AgencyClientShell customerId={customerId} section={section} />;
};
