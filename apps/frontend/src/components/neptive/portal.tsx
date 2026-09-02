'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@gitroom/react/form/button';
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
  formatWhen,
  postPreviewText,
  statusTone,
} from '@gitroom/frontend/components/neptive/neptive.ui';
import clsx from 'clsx';
import { PedCalendar, PedContentList, pedSummary } from '@gitroom/frontend/components/neptive/ped-calendar';
import { PedCalendarItem } from '@gitroom/frontend/components/neptive/ped-content-card';
import { PedContentDetail } from '@gitroom/frontend/components/neptive/ped-content-detail';

const NAV = [
  { href: '/portal', label: 'Overview' },
  { href: '/portal/ped', label: 'PED' },
  { href: '/portal/approvals', label: 'Approvals' },
  { href: '/portal/calendar', label: 'Upcoming' },
  { href: '/portal/strategy', label: 'Strategy' },
  { href: '/portal/activities', label: 'Work done' },
  { href: '/portal/materials', label: 'Materials' },
  { href: '/portal/reports', label: 'Reports' },
  { href: '/portal/analytics', label: 'Results' },
];

export const PortalShell = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const pathname = usePathname();
  const { data: me } = useNeptivePortalMe();
  const fetch = useFetch();
  const router = useRouter();
  const [navReady, setNavReady] = useState(false);
  useEffect(() => {
    setNavReady(true);
  }, []);

  const logout = useCallback(async () => {
    await fetch('/neptive/portal-auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    document.cookie = 'neptive_portal=; path=/; max-age=-1';
    router.push('/portal/login');
  }, [fetch, router]);

  return (
    <div className="min-h-screen bg-newBgColor text-textColor">
      <div className="border-b border-newTableBorder px-[24px] py-[14px] flex items-center justify-between">
        <div>
          <div className="text-[12px] text-newTableText">Client portal</div>
          <div className="font-[700]" suppressHydrationWarning>
            {me?.name || 'Welcome'}
          </div>
        </div>
        <button className="text-[13px] text-newTableText" onClick={logout}>
          Sign out
        </button>
      </div>
      <div className="flex flex-wrap gap-[6px] px-[24px] py-[12px]">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'px-[10px] py-[6px] rounded-[8px] text-[12px] font-[600]',
              navReady && pathname === item.href
                ? 'bg-boxFocused text-textItemFocused'
                : 'text-newTableText hover:bg-newBoxHover'
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <div className="px-[24px] pb-[40px] max-w-[1100px]">{children}</div>
    </div>
  );
};

export const PortalLogin = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-newBgColor text-textColor">
      <NeptiveCard title="Client portal">
        <div className="text-[13px] text-newTableText max-w-[360px]">
          Use the magic link sent by your agency. If you already opened it, this
          page will sign you in automatically.
        </div>
      </NeptiveCard>
    </div>
  );
};

export const PortalMagic = ({ token }: { token: string }) => {
  const fetch = useFetch();
  const router = useRouter();
  const [error, setError] = useState('');

  const confirm = useCallback(async () => {
    const response = await fetch('/neptive/portal-auth/magic', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    if (!response.ok) {
      setError('This link is invalid or has already been used.');
      return;
    }
    router.push('/portal');
  }, [fetch, token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-newBgColor text-textColor">
      <NeptiveCard title="Open your portal">
        <div className="flex flex-col gap-[12px] max-w-[360px]">
          <div className="text-[13px] text-newTableText">
            Confirm to enter your company workspace. You will only see your own
            content.
          </div>
          {error && <div className="text-red-400 text-[13px]">{error}</div>}
          <Button onClick={confirm}>Continue</Button>
        </div>
      </NeptiveCard>
    </div>
  );
};

export const PortalOverview = () => {
  const { data } = useNeptivePortal('dashboard');
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-[12px]">
      <NeptiveCard title="What needs my approval?">
        {(data?.awaitingApproval || []).map((item: any) => (
          <div key={item.id} className="py-[6px]">
            {item.title || item.postGroup}{' '}
            <NeptiveBadge tone="warn">{item.status}</NeptiveBadge>
          </div>
        ))}
        {!data?.awaitingApproval?.length && (
          <NeptiveEmpty>Nothing waiting</NeptiveEmpty>
        )}
      </NeptiveCard>
      <NeptiveCard title="Current PED">
        {data?.currentPed ? (
          <div>
            <div className="font-[600]">{data.currentPed.name}</div>
            <NeptiveBadge tone={statusTone(data.currentPed.status)}>
              {data.currentPed.status}
            </NeptiveBadge>
          </div>
        ) : (
          <NeptiveEmpty>No active plan</NeptiveEmpty>
        )}
      </NeptiveCard>
      <NeptiveCard title="What Neptive has done">
        {(data?.recentActivities || []).map((item: any) => (
          <div key={item.id} className="text-[13px] py-[4px]">
            {item.title}
          </div>
        ))}
        {!data?.recentActivities?.length && (
          <NeptiveEmpty>No recent work logged</NeptiveEmpty>
        )}
      </NeptiveCard>
      <NeptiveCard title="Coming next">
        {(data?.upcoming || []).map((item: any) => (
          <div key={item.id} className="text-[13px] py-[4px]">
            <div className="line-clamp-2">
              {postPreviewText(item.content) || 'Scheduled post'}
            </div>
            <div className="text-[12px] text-newTableText">
              {item.integration?.providerIdentifier} · {formatWhen(item.publishDate)}
            </div>
          </div>
        ))}
        {!data?.upcoming?.length && <NeptiveEmpty>Nothing scheduled</NeptiveEmpty>}
      </NeptiveCard>
    </div>
  );
};

export const PortalPeds = () => {
  const { data, mutate } = useNeptivePortal('peds');
  const { data: previewIdentity } = useNeptivePortal('preview-identity');
  const fetch = useFetch();
  const [selectedItem, setSelectedItem] = useState<PedCalendarItem | null>(null);
  const [pedComment, setPedComment] = useState('');
  const [busy, setBusy] = useState(false);
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
  const reviewContent = useCallback(async (status: string, comment?: string) => {
    if (!selectedItem?.approval?.id) return;
    setBusy(true);
    try {
      const response = await fetch(`/neptive/portal/approvals/${selectedItem.approval.id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ status, comment }),
      });
      if (response.ok) {
        setSelectedItem(null);
        await mutate();
      }
    } finally {
      setBusy(false);
    }
  }, [fetch, mutate, selectedItem]);
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
                  <div className="text-[11px] uppercase tracking-[0.08em] text-newTableText">Piano editoriale</div>
                  <div className="text-[24px] font-[700]">{ped.name}</div>
                  <div className="text-[12px] text-newTableText">{ped.periodStart?.slice(0, 10)} → {ped.periodEnd?.slice(0, 10)}</div>
                </div>
                <NeptiveBadge tone={statusTone(ped.status)}>{ped.status}</NeptiveBadge>
              </div>
              {ped.objectives && <div className="text-[13px] mt-[10px] whitespace-pre-wrap">{ped.objectives}</div>}
              <div className="flex flex-wrap gap-[6px] mt-[12px]">
                <NeptiveBadge>{summary.total} contenuti</NeptiveBadge>
                <NeptiveBadge>{summary.carousels} caroselli</NeptiveBadge>
                <NeptiveBadge>{summary.reels} reel</NeptiveBadge>
                <NeptiveBadge>{summary.posts} post</NeptiveBadge>
                <NeptiveBadge>{summary.stories} stories</NeptiveBadge>
              </div>
              {ped.status === 'CLIENT_REVIEW' && (
                <div className="mt-[14px] flex flex-col gap-[8px]">
                  <textarea className={areaClass} placeholder="Commento generale o richiesta di modifica" value={pedComment} onChange={(event) => setPedComment(event.target.value)} />
                  <div className="flex gap-[8px] flex-wrap">
                    <Button onClick={() => transition(ped.id, 'APPROVED')} disabled={busy}>Approva piano editoriale</Button>
                    <Button secondary onClick={() => { if (pedComment.trim()) transition(ped.id, 'CHANGES_REQUESTED'); }} disabled={busy || !pedComment.trim()}>Richiedi modifica</Button>
                  </div>
                </div>
              )}
            </NeptiveCard>
            <PedCalendar items={items} periodStart={ped.periodStart} periodEnd={ped.periodEnd} onOpen={setSelectedItem} />
            <PedContentList items={items} onOpen={setSelectedItem} />
          </div>
        );
      })}
      {!data?.length && <NeptiveCard title="Piani editoriali"><NeptiveEmpty>Nessun piano editoriale</NeptiveEmpty></NeptiveCard>}
      <PedContentDetail item={selectedItem} mode="client" previewIdentity={previewIdentity} onClose={() => setSelectedItem(null)} onApprove={() => reviewContent('APPROVED')} onRequestChanges={(comment) => reviewContent('CHANGES_REQUESTED', comment)} busy={busy} />
    </div>
  );
};

export const PortalApprovals = () => {
  const { data, mutate } = useNeptivePortal('approvals');
  const fetch = useFetch();
  const [comments, setComments] = useState<Record<string, string>>({});
  const act = useCallback(
    async (id: string, status: string) => {
      const comment = comments[id] || '';
      if (
        (status === 'CHANGES_REQUESTED' || status === 'REJECTED') &&
        !comment.trim()
      ) {
        return;
      }
      const response = await fetch(`/neptive/portal/approvals/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ status, comment }),
      });
      if (!response.ok) {
        return;
      }
      setComments((current) => ({ ...current, [id]: '' }));
      await mutate();
    },
    [fetch, comments, mutate]
  );
  return (
    <div className="flex flex-col gap-[12px]">
      {(data || []).map((row: any) => (
        <NeptiveCard
          key={row.id}
          title={row.title || row.post?.text || 'Content for approval'}
        >
          <NeptiveBadge tone={statusTone(row.status)}>{row.status}</NeptiveBadge>
          {row.post?.text && (
            <div className="text-[13px] mt-[8px] whitespace-pre-wrap">
              {row.post.text}
            </div>
          )}
          <div className="text-[12px] text-newTableText mt-[8px]">
            {[row.post?.provider, row.post?.state, formatWhen(row.post?.publishDate)]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {(row.comments || []).map((item: any) => (
            <div key={item.id} className="text-[13px] py-[4px]">
              {item.authorName}: {item.body}
            </div>
          ))}
          {row.status === 'PENDING_CLIENT_APPROVAL' && (
            <>
              <textarea
                className={areaClass + ' mt-[8px]'}
                placeholder="Comment (required for changes / rejection)"
                value={comments[row.id] || ''}
                onChange={(e) =>
                  setComments((current) => ({
                    ...current,
                    [row.id]: e.target.value,
                  }))
                }
              />
              <div className="flex gap-[8px] mt-[8px] flex-wrap">
                <Button onClick={() => act(row.id, 'APPROVED')}>Approve</Button>
                <Button
                  secondary={true}
                  onClick={() => act(row.id, 'CHANGES_REQUESTED')}
                >
                  Request changes
                </Button>
                <Button
                  className="bg-red-700"
                  onClick={() => act(row.id, 'REJECTED')}
                >
                  Reject
                </Button>
              </div>
            </>
          )}
        </NeptiveCard>
      ))}
      {!data?.length && <NeptiveEmpty>Nothing to approve</NeptiveEmpty>}
    </div>
  );
};

export const PortalList = ({
  path,
  title,
  render,
}: {
  path: string;
  title: string;
  render: (row: any) => React.ReactNode;
}) => {
  const { data } = useNeptivePortal(path);
  const rows = Array.isArray(data) ? data : data?.posts || [];
  return (
    <NeptiveCard title={title}>
      {rows.map((row: any) => (
        <div key={row.id || row.integrationId} className="py-[8px] border-b border-newTableBorder">
          {render(row)}
        </div>
      ))}
      {!rows.length && <NeptiveEmpty>Nothing to show</NeptiveEmpty>}
    </NeptiveCard>
  );
};
