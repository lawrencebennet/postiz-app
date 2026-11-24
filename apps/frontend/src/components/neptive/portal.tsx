'use client';

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  useNeptivePortal,
  useNeptivePortalMe,
} from '@gitroom/frontend/components/neptive/neptive.hooks';
import {
  NeptiveBadge,
  NeptiveCard,
  NeptiveEmpty,
  areaClass,
  formatPeriod,
  formatWhen,
  postPreviewText,
  statusLabel,
  statusTone,
} from '@gitroom/frontend/components/neptive/neptive.ui';
import clsx from 'clsx';
import { PedCalendar, pedSummary } from '@gitroom/frontend/components/neptive/ped-calendar';
import { PedCalendarItem } from '@gitroom/frontend/components/neptive/ped-content-card';
import { PedSlotFeed, scrollToSlot } from '@gitroom/frontend/components/neptive/ped-variants';
import { NeptiveWordmark } from '@gitroom/frontend/components/neptive/brand/logo';
import { NeptiveAuthShell } from '@gitroom/frontend/components/neptive/brand/auth-shell';

const NAV = [
  { href: '/portal', label: 'Panoramica' },
  { href: '/portal/ped', label: 'Piano editoriale' },
  { href: '/portal/approvals', label: 'Approvazioni' },
  { href: '/portal/calendar', label: 'In uscita' },
  { href: '/portal/strategy', label: 'Strategia' },
  { href: '/portal/activities', label: 'Lavoro svolto' },
  { href: '/portal/materials', label: 'Materiali' },
  { href: '/portal/reports', label: 'Report' },
  { href: '/portal/analytics', label: 'Risultati' },
  { href: '/portal/account', label: 'Account' },
];

const firstName = (name?: string | null) => (name || '').trim().split(/\s+/)[0] || '';

export const PortalShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const { data: me } = useNeptivePortalMe();
  const fetch = useFetch();
  const router = useRouter();
  const [navReady, setNavReady] = useState(false);
  useEffect(() => {
    setNavReady(true);
  }, []);
  // narrow screens: the section list scrolls sideways, keep the current one in view
  useEffect(() => {
    if (navReady) {
      document
        .querySelector('nav[aria-label="Sezioni del portale"] [aria-current="page"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [navReady, pathname]);
  // a session opened with a temporary password reaches nothing else (the API answers 403 too)
  const mustChangePassword = !!me?.passwordChangeRequired;
  useEffect(() => {
    if (mustChangePassword) {
      router.replace('/portal/password');
    }
  }, [mustChangePassword, router]);

  const logout = useCallback(async () => {
    await fetch('/neptive/portal-auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    document.cookie = 'neptive_portal=; path=/; max-age=-1';
    router.push('/portal/login');
  }, [fetch, router]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--nx-bg)] text-[var(--nx-text)]">
      <header className="nx-portal-header md:sticky top-0 z-[40] border-b border-[var(--nx-line)]">
        <div className="max-w-[1180px] mx-auto px-[16px] md:px-[32px] h-[58px] flex items-center justify-between gap-[12px]">
          <Link href="/portal" className="flex items-end gap-[10px] min-w-0" aria-label="Neptive, portale clienti">
            <NeptiveWordmark className="h-[21px] w-auto shrink-0" />
            <span className="nx-label leading-none pb-[1px] hidden sm:inline">Portale clienti</span>
          </Link>
          <div className="flex items-center gap-[14px] min-w-0">
            <Link
              href="/portal/account"
              className="nx-label truncate max-w-[180px] hidden sm:block hover:!text-[var(--nx-text)]"
              title="Il tuo account"
              suppressHydrationWarning
            >
              {me?.name || ''}
            </Link>
            <button type="button" className="nx-btn" data-size="sm" onClick={logout}>
              Esci
            </button>
          </div>
        </div>
        <nav className="max-w-[1180px] mx-auto" aria-label="Sezioni del portale">
          <ul className="flex gap-[4px] overflow-x-auto px-[16px] md:px-[32px] pb-[10px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV.map((item) => {
              const active = navReady && pathname === item.href;
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'nx-mono inline-flex items-center h-[30px] px-[10px] rounded-[2px] text-[10.5px] uppercase tracking-[0.03em] transition-colors',
                      active
                        ? 'bg-[var(--nx-text)] text-[var(--nx-bg)]'
                        : 'text-[var(--nx-text-muted)] hover:text-[var(--nx-text)] hover:bg-[var(--nx-surface-2)]'
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main className="flex-1 w-full max-w-[1180px] mx-auto px-[16px] md:px-[32px] pt-[24px] md:pt-[40px] pb-[56px] min-w-0">
        {mustChangePassword ? null : children}
      </main>
      <footer className="w-full max-w-[1180px] mx-auto px-[16px] md:px-[32px] pb-[20px]">
        <div className="nx-rule pt-[12px] flex flex-wrap justify-between gap-[8px] nx-label">
          <span>Neptive Studio · Social Portal</span>
          <a href="mailto:info@neptive.com" className="hover:text-[var(--nx-text)]">
            Serve aiuto? info@neptive.com
          </a>
        </div>
      </footer>
    </div>
  );
};

/** page title block: mono eyebrow + display heading (+ optional aside) */
export const PortalHeader = ({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) => (
  <div className="mb-[24px] md:mb-[36px] flex flex-col md:flex-row md:items-end md:justify-between gap-[14px]">
    <div className="min-w-0">
      <div className="nx-label mb-[10px] md:mb-[16px]">[ {eyebrow} ]</div>
      <h1 className="nx-display text-[40px] sm:text-[52px] md:text-[72px] break-words">{title}</h1>
    </div>
    {children && <div className="min-w-0 md:max-w-[420px] md:text-end">{children}</div>}
  </div>
);

export const PortalMagic = ({ token }: { token: string }) => {
  const fetch = useFetch();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = useCallback(async () => {
    setBusy(true);
    const response = await fetch('/neptive/portal-auth/magic', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    if (!response.ok) {
      setError('Questo link non è valido o è già stato usato.');
      setBusy(false);
      return;
    }
    router.push('/portal');
  }, [fetch, token, router]);

  return (
    <NeptiveAuthShell
      eyebrow="[ Portale clienti ]"
      tag="[ Portale clienti ]"
      title={
        <>
          Benve-
          <br />
          nuto.
        </>
      }
      intro="Qui trovi il piano editoriale, le anteprime dei post e le approvazioni che ti chiediamo."
    >
      <div className="flex-1 flex flex-col">
        <h2 className="nx-heading text-[30px] md:text-[34px]">Entra nel portale</h2>
        <p className="mt-[12px] text-[15px] leading-[1.5] text-[var(--nx-text-muted)]">
          Conferma per aprire lo spazio della tua azienda. Vedrai solo i tuoi contenuti.
        </p>
        {error && (
          <div
            role="alert"
            className="mt-[18px] rounded-[var(--nx-r)] bg-[var(--nx-bad-bg)] px-[14px] py-[11px] text-[14px] text-[var(--nx-bad)]"
          >
            {error}{' '}
            <a className="nx-link" href="mailto:info@neptive.com">
              Chiedi un nuovo link
            </a>
          </div>
        )}
        <button type="button" data-variant="primary" className="nx-btn mt-[24px] w-full" onClick={confirm} disabled={busy}>
          {busy ? 'Apertura…' : 'Continua'}
          {!busy && (
            <span className="nx-arrow" aria-hidden="true">
              ↗
            </span>
          )}
        </button>
        <p className="mt-[16px] nx-label">Il link è personale e vale una sola volta.</p>
      </div>
    </NeptiveAuthShell>
  );
};

const SectionTitle = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-[12px] mb-[12px]">
    <h2 className="nx-heading text-[20px] md:text-[24px]">{children}</h2>
    {aside && <span className="nx-label shrink-0">{aside}</span>}
  </div>
);

export const PortalOverview = () => {
  const { data } = useNeptivePortal('dashboard');
  const { data: me } = useNeptivePortalMe();
  // one row per content: the variants of a slot (A, B, C…) are grouped, the client decides them together
  const waiting = useMemo(() => {
    const rows: Array<{ id: string; title: string; status: string; labels: string[] }> = [];
    const bySlot = new Map<string, (typeof rows)[number]>();
    for (const item of (data?.awaitingApproval || []) as any[]) {
      const slot = item.variant?.itemTitle;
      const existing = slot ? bySlot.get(slot) : undefined;
      if (existing) {
        existing.labels.push(item.variant.label);
        continue;
      }
      const row = { id: item.id, title: slot || item.title || 'Contenuto', status: item.status, labels: item.variant ? [item.variant.label] : [] };
      rows.push(row);
      if (slot) bySlot.set(slot, row);
    }
    return rows;
  }, [data?.awaitingApproval]);
  const name = firstName(me?.name);
  return (
    <div className="flex flex-col gap-[16px] md:gap-[20px]">
      <PortalHeader eyebrow={name ? `Ciao ${name}` : 'Portale clienti'} title="Panoramica." />

      <section className="nx-card p-[18px] md:p-[28px] grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)] gap-[16px] md:gap-[40px] items-start">
        <div className="flex md:flex-col items-end md:items-start gap-[14px]">
          <div className="nx-display text-[72px] md:text-[112px] leading-[0.8]">{waiting.length}</div>
          <div className="nx-label pb-[6px] md:pb-0">
            {waiting.length === 1 ? 'Contenuto da approvare' : 'Contenuti da approvare'}
          </div>
        </div>
        <div className="min-w-0 flex flex-col gap-[14px]">
          {waiting.length ? (
            <ul className="flex flex-col divide-y divide-[var(--nx-line)]">
              {waiting.slice(0, 5).map((item: any) => (
                <li key={item.id} className="py-[10px] first:pt-0 flex items-center justify-between gap-[12px]">
                  <span className="min-w-0 flex flex-col gap-[4px]">
                    <span className="text-[15px] leading-[1.35] break-words">{item.title}</span>
                    {item.labels.length > 1 && (
                      <span className="nx-label">Scegli tra {item.labels.length} varianti · {item.labels.join(' ')}</span>
                    )}
                  </span>
                  <NeptiveBadge tone={statusTone(item.status)}>{statusLabel(item.status)}</NeptiveBadge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[16px] text-[var(--nx-text-muted)]">Tutto in ordine: niente da approvare in questo momento.</p>
          )}
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-[8px]">
            <Link href="/portal/ped" data-variant="primary" className="nx-btn">
              Vai al piano editoriale <span className="nx-arrow" aria-hidden="true">↗</span>
            </Link>
            {waiting.length > 0 && (
              <Link href="/portal/approvals" className="nx-btn">
                Tutte le approvazioni
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px] md:gap-[20px]">
        <NeptiveCard title="Piano in corso">
          {data?.currentPed ? (
            <Link href="/portal/ped" className="block group">
              <div className="nx-heading text-[22px] group-hover:underline underline-offset-4 decoration-1">
                {data.currentPed.name}
              </div>
              <div className="mt-[10px] flex flex-wrap items-center gap-[8px]">
                <NeptiveBadge tone={statusTone(data.currentPed.status)}>{statusLabel(data.currentPed.status)}</NeptiveBadge>
                {(data.currentPed.periodStart || data.currentPed.periodEnd) && (
                  <span className="nx-label">{formatPeriod(data.currentPed.periodStart, data.currentPed.periodEnd)}</span>
                )}
              </div>
            </Link>
          ) : (
            <NeptiveEmpty>Nessun piano attivo.</NeptiveEmpty>
          )}
        </NeptiveCard>
        <NeptiveCard title="In uscita" action={<Link className="nx-label nx-link" href="/portal/calendar">Tutti</Link>}>
          <ul className="flex flex-col divide-y divide-[var(--nx-line)]">
            {(data?.upcoming || []).slice(0, 4).map((item: any) => (
              <li key={item.id} className="py-[10px] first:pt-0">
                <div className="nx-label">{formatWhen(item.publishDate)}</div>
                <div className="text-[14px] leading-[1.4] line-clamp-2 mt-[2px]">
                  {postPreviewText(item.content) || 'Post programmato'}
                </div>
              </li>
            ))}
          </ul>
          {!data?.upcoming?.length && <NeptiveEmpty>Niente in programma.</NeptiveEmpty>}
        </NeptiveCard>
        <NeptiveCard
          title="Lavoro svolto da Neptive"
          className="md:col-span-2"
          action={<Link className="nx-label nx-link" href="/portal/activities">Tutto</Link>}
        >
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-[28px]">
            {(data?.recentActivities || []).slice(0, 6).map((item: any) => (
              <li key={item.id} className="py-[9px] border-b border-[var(--nx-line)] text-[14px] leading-[1.4]">
                {item.title}
              </li>
            ))}
          </ul>
          {!data?.recentActivities?.length && <NeptiveEmpty>Ancora nessuna attività registrata.</NeptiveEmpty>}
        </NeptiveCard>
      </div>
    </div>
  );
};

const PED_SUMMARY = (summary: ReturnType<typeof pedSummary>) =>
  [
    [summary.total, 'contenuti', 'contenuto'],
    [summary.posts, 'post', 'post'],
    [summary.carousels, 'caroselli', 'carosello'],
    [summary.reels, 'reel', 'reel'],
    [summary.stories, 'stories', 'story'],
  ].filter(([count], index) => index === 0 || Number(count) > 0) as Array<[number, string, string]>;

export const PortalPeds = () => {
  const { data, mutate } = useNeptivePortal('peds');
  const { data: previewIdentity } = useNeptivePortal('preview-identity');
  const fetch = useFetch();
  const [pedComment, setPedComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [readMore, setReadMore] = useState<Record<string, boolean>>({});
  const transition = useCallback(
    async (id: string, status: string) => {
      setBusy(true);
      try {
        const response = await fetch(`/neptive/portal/peds/${id}/transition`, {
          method: 'POST',
          body: JSON.stringify({ status, comment: pedComment || undefined }),
        });
        if (response.ok) {
          setPedComment('');
          await mutate();
        }
      } finally {
        setBusy(false);
      }
    },
    [fetch, mutate, pedComment]
  );
  return (
    <div className="flex flex-col gap-[16px] min-w-0">
      <PortalHeader eyebrow="Piano editoriale" title="I contenuti." />
      {(data || []).map((ped: any) => {
        const items = (ped.items || []) as PedCalendarItem[];
        const summary = pedSummary(items);
        const toChoose = items.filter((item) => (item.variants || []).some((variant) => variant.client?.canDecide)).length;
        const long = (ped.objectives || '').length > 220;
        return (
          <div key={ped.id} className="flex flex-col gap-[16px] min-w-0">
            <section className="nx-card p-[18px] md:p-[28px] min-w-0">
              <div className="flex items-start justify-between gap-[12px] flex-wrap">
                <div className="min-w-0">
                  <div className="nx-label">{formatPeriod(ped.periodStart, ped.periodEnd)}</div>
                  <h2 className="nx-heading text-[26px] md:text-[34px] mt-[6px] break-words">{ped.name}</h2>
                </div>
                <NeptiveBadge tone={statusTone(ped.status)}>{statusLabel(ped.status)}</NeptiveBadge>
              </div>
              {ped.objectives && (
                <div className="mt-[14px] max-w-[760px]">
                  <p
                    className={clsx(
                      'text-[15px] leading-[1.55] text-[var(--nx-text-muted)] whitespace-pre-wrap',
                      long && !readMore[ped.id] && 'line-clamp-4'
                    )}
                  >
                    {ped.objectives}
                  </p>
                  {long && (
                    <button
                      type="button"
                      className="nx-label nx-link mt-[6px] hover:!text-[var(--nx-text)]"
                      onClick={() => setReadMore((current) => ({ ...current, [ped.id]: !current[ped.id] }))}
                    >
                      {readMore[ped.id] ? 'Mostra meno' : 'Leggi tutto'}
                    </button>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-[6px] mt-[16px]">
                {PED_SUMMARY(summary).map(([count, many, one]) => (
                  <NeptiveBadge key={many}>
                    {count} {count === 1 ? one : many}
                  </NeptiveBadge>
                ))}
                {toChoose > 0 && <NeptiveBadge tone="solid">{toChoose} da valutare</NeptiveBadge>}
              </div>
              {ped.status === 'CLIENT_REVIEW' && (
                <div className="mt-[20px] pt-[18px] nx-rule flex flex-col gap-[10px]">
                  <div className="nx-label">Il piano nel suo insieme</div>
                  <textarea
                    className={areaClass}
                    placeholder="Commento generale o richiesta di modifica sul piano"
                    value={pedComment}
                    onChange={(event) => setPedComment(event.target.value)}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-[8px] sm:max-w-[560px]">
                    <button
                      type="button"
                      className="nx-btn"
                      onClick={() => {
                        if (pedComment.trim()) transition(ped.id, 'CHANGES_REQUESTED');
                      }}
                      disabled={busy || !pedComment.trim()}
                    >
                      Richiedi modifica
                    </button>
                    <button
                      type="button"
                      data-variant="primary"
                      className="nx-btn"
                      onClick={() => transition(ped.id, 'APPROVED')}
                      disabled={busy}
                    >
                      Approva il piano
                    </button>
                  </div>
                </div>
              )}
            </section>
            <details className="hidden md:block group nx-card">
              <summary className="cursor-pointer select-none list-none flex items-center justify-between px-[20px] py-[14px] nx-label hover:!text-[var(--nx-text)]">
                Vista calendario del mese
                <span aria-hidden="true" className="nx-mono text-[14px] group-open:rotate-45 transition-transform">
                  +
                </span>
              </summary>
              <div className="px-[12px] pb-[12px]">
                <PedCalendar
                  items={items}
                  periodStart={ped.periodStart}
                  periodEnd={ped.periodEnd}
                  onOpen={scrollToSlot}
                  mobileList={false}
                  bare
                />
              </div>
            </details>
            <div className="mt-[8px]">
              <SectionTitle aside={`${items.length} ${items.length === 1 ? 'data' : 'date'}`}>In ordine di data</SectionTitle>
            </div>
            <PedSlotFeed items={items} mode="client" previewIdentity={previewIdentity} onChanged={mutate} />
          </div>
        );
      })}
      {!data?.length && (
        <NeptiveCard>
          <NeptiveEmpty>Non c’è ancora un piano editoriale da mostrarti.</NeptiveEmpty>
        </NeptiveCard>
      )}
    </div>
  );
};

export const PortalApprovals = () => {
  const { data, mutate } = useNeptivePortal('approvals');
  const fetch = useFetch();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const act = useCallback(
    async (id: string, status: string) => {
      const comment = comments[id] || '';
      if ((status === 'CHANGES_REQUESTED' || status === 'REJECTED') && !comment.trim()) {
        setErrors((current) => ({ ...current, [id]: 'Scrivi un commento per spiegare cosa cambiare.' }));
        return;
      }
      setErrors((current) => ({ ...current, [id]: '' }));
      const response = await fetch(`/neptive/portal/approvals/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ status, comment }),
      });
      if (!response.ok) {
        setErrors((current) => ({ ...current, [id]: 'Non è stato possibile completare l’azione. Riprova.' }));
        return;
      }
      setComments((current) => ({ ...current, [id]: '' }));
      await mutate();
    },
    [fetch, comments, mutate]
  );
  const rows = data || [];
  const pending = rows.filter((row: any) => row.status === 'PENDING_CLIENT_APPROVAL').length;
  return (
    <div className="flex flex-col gap-[14px]">
      <PortalHeader eyebrow="Approvazioni" title="Le tue decisioni.">
        <p className="text-[15px] text-[var(--nx-text-muted)]">
          {pending ? `${pending} in attesa di una tua risposta.` : 'Nessuna approvazione in attesa.'}
        </p>
      </PortalHeader>
      {rows.map((row: any) => (
        <section key={row.id} className="nx-card p-[16px] md:p-[22px] min-w-0">
          <div className="flex items-start justify-between gap-[12px]">
            <div className="min-w-0">
              <div className="nx-label">
                {[row.post?.provider, formatWhen(row.post?.publishDate)].filter(Boolean).join(' · ')}
              </div>
              <h2 className="nx-heading text-[19px] md:text-[22px] mt-[4px] break-words">
                {row.variant
                  ? `${row.variant.itemTitle || row.title || 'Contenuto'} · variante ${row.variant.label}`
                  : row.title || postPreviewText(row.post?.text) || 'Contenuto da approvare'}
              </h2>
            </div>
            <NeptiveBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</NeptiveBadge>
          </div>
          {row.post?.text && (
            <p className="text-[14px] leading-[1.5] mt-[12px] whitespace-pre-wrap text-[var(--nx-text-muted)] line-clamp-6">
              {row.post.text}
            </p>
          )}
          {!!row.comments?.length && (
            <ul className="mt-[14px] flex flex-col gap-[6px]">
              {row.comments.map((item: any) => (
                <li key={item.id} className="text-[14px] leading-[1.45] rounded-[var(--nx-r)] bg-[var(--nx-surface-2)] px-[12px] py-[8px]">
                  <span className="nx-label !text-[var(--nx-text)] mr-[8px]">{item.authorName}</span>
                  {item.body}
                </li>
              ))}
            </ul>
          )}
          {row.status === 'PENDING_CLIENT_APPROVAL' && (
            <div className="mt-[16px] pt-[16px] nx-rule flex flex-col gap-[10px]">
              <textarea
                className={areaClass}
                placeholder="Commento (obbligatorio per chiedere modifiche o rifiutare)"
                value={comments[row.id] || ''}
                onChange={(e) =>
                  setComments((current) => ({
                    ...current,
                    [row.id]: e.target.value,
                  }))
                }
              />
              {errors[row.id] && (
                <div role="alert" className="text-[13px] text-[var(--nx-bad)]">
                  {errors[row.id]}
                </div>
              )}
              <div className="grid grid-cols-2 sm:flex gap-[8px]">
                <button type="button" className="nx-btn" onClick={() => act(row.id, 'CHANGES_REQUESTED')}>
                  Richiedi modifiche
                </button>
                <button type="button" data-variant="primary" className="nx-btn" onClick={() => act(row.id, 'APPROVED')}>
                  Approva
                </button>
                <button
                  type="button"
                  className="nx-btn col-span-2 sm:col-span-1 !border-transparent !text-[var(--nx-bad)] hover:!border-[var(--nx-bad)]"
                  onClick={() => act(row.id, 'REJECTED')}
                >
                  Rifiuta
                </button>
              </div>
            </div>
          )}
        </section>
      ))}
      {!rows.length && (
        <NeptiveCard>
          <NeptiveEmpty>Niente da approvare.</NeptiveEmpty>
        </NeptiveCard>
      )}
    </div>
  );
};

export const PortalList = ({
  path,
  title,
  eyebrow,
  intro,
  empty = 'Niente da mostrare per ora.',
  render,
}: {
  path: string;
  title: string;
  eyebrow: string;
  intro?: string;
  empty?: string;
  render: (row: any) => React.ReactNode;
}) => {
  const { data } = useNeptivePortal(path);
  const rows = Array.isArray(data) ? data : data?.posts || [];
  return (
    <div className="flex flex-col">
      <PortalHeader eyebrow={eyebrow} title={title}>
        {intro && <p className="text-[15px] text-[var(--nx-text-muted)]">{intro}</p>}
      </PortalHeader>
      <section className="nx-card px-[16px] md:px-[22px] min-w-0">
        <ul className="flex flex-col divide-y divide-[var(--nx-line)]">
          {rows.map((row: any) => (
            <li key={row.id || row.integrationId} className="py-[16px] min-w-0">
              {render(row)}
            </li>
          ))}
        </ul>
        {!rows.length && (
          <div className="py-[16px]">
            <NeptiveEmpty>{empty}</NeptiveEmpty>
          </div>
        )}
      </section>
    </div>
  );
};
