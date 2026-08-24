'use client';

import { useCallback, useState } from 'react';
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
  statusTone,
} from '@gitroom/frontend/components/neptive/neptive.ui';
import { useToaster } from '@gitroom/react/toaster/toaster';
import clsx from 'clsx';

const TABS = [
  { href: '', label: 'Overview' },
  { href: '/ped', label: 'PED' },
  { href: '/content', label: 'Content' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/strategy', label: 'Strategy' },
  { href: '/activities', label: 'Activities' },
  { href: '/materials', label: 'Materials' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/reports', label: 'Reports' },
  { href: '/users', label: 'Client users' },
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
    <div className="flex flex-col gap-[16px] text-textColor">
      <div className="flex items-start justify-between gap-[12px]">
        <div>
          <Link href="/agency" className="text-[12px] text-newTableText">
            ← All clients
          </Link>
          <div className="text-[22px] font-[700]">{client?.name || 'Client'}</div>
        </div>
        <Link
          href="/launches"
          className="text-[13px] px-[12px] h-[40px] flex items-center rounded-[8px] bg-newBtnSimple"
        >
          Open Postiz calendar
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
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[12px]">
      <NeptiveCard title="Current PED">
        {data?.currentPed ? (
          <div>
            <div className="font-[600]">{data.currentPed.name}</div>
            <NeptiveBadge tone={statusTone(data.currentPed.status)}>
              {data.currentPed.status}
            </NeptiveBadge>
          </div>
        ) : (
          <NeptiveEmpty>No editorial plan yet</NeptiveEmpty>
        )}
      </NeptiveCard>
      <NeptiveCard title="Awaiting client approval">
        <div className="text-[28px] font-[700]">
          {data?.awaitingApproval ?? 0}
        </div>
      </NeptiveCard>
      <NeptiveCard title="Latest report">
        {data?.latestReport ? (
          <div>{data.latestReport.title}</div>
        ) : (
          <NeptiveEmpty>No report yet</NeptiveEmpty>
        )}
      </NeptiveCard>
      <NeptiveCard title="Upcoming in Postiz">
        {upcoming.slice(0, 6).map((item: any) => (
          <div key={item.id} className="text-[13px] py-[4px] border-b border-newTableBorder last:border-0">
            <div className="line-clamp-2">{postPreviewText(item.content) || 'Scheduled post'}</div>
            <div className="text-[11px] text-newTableText">
              {item.integration?.providerIdentifier} · {formatWhen(item.publishDate)}
            </div>
          </div>
        ))}
        {!upcoming.length && <NeptiveEmpty>Nothing queued</NeptiveEmpty>}
      </NeptiveCard>
      <NeptiveCard title="Recent work" className="md:col-span-2">
        {(data?.recentActivities || []).slice(0, 6).map((item: any) => (
          <div key={item.id} className="text-[13px] py-[4px]">
            {item.title}
          </div>
        ))}
        {!data?.recentActivities?.length && (
          <NeptiveEmpty>No activities logged</NeptiveEmpty>
        )}
      </NeptiveCard>
    </div>
  );
};

const PedPanel = ({ customerId }: { customerId: string }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, mutate } = useNeptiveAgencyList(customerId, 'peds');
  const [name, setName] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [objectives, setObjectives] = useState('');
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});

  const create = useCallback(async () => {
    const response = await fetch(`/neptive/agency/clients/${customerId}/peds`, {
      method: 'POST',
      body: JSON.stringify({ name, periodStart, periodEnd, objectives }),
    });
    if (!response.ok) {
      toaster.show('Could not create PED', 'warning');
      return;
    }
    setName('');
    setObjectives('');
    await mutate();
  }, [fetch, customerId, name, periodStart, periodEnd, objectives, mutate, toaster]);

  const transition = useCallback(
    async (id: string, status: string) => {
      const response = await fetch(
        `/neptive/agency/clients/${customerId}/peds/${id}/transition`,
        { method: 'POST', body: JSON.stringify({ status }) }
      );
      if (!response.ok) {
        toaster.show('That step is not available yet', 'warning');
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
        { method: 'POST', body: JSON.stringify({ title }) }
      );
      if (!response.ok) {
        toaster.show('Could not add item', 'warning');
        return;
      }
      setItemDrafts((current) => ({ ...current, [id]: '' }));
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
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[12px]">
      <NeptiveCard title="Editorial plans">
        {(data || []).map((ped: any) => (
          <div
            key={ped.id}
            className="border-b border-newTableBorder py-[12px] last:border-0"
          >
            <div className="flex items-center gap-[8px] flex-wrap">
              <div className="font-[600]">{ped.name}</div>
              <NeptiveBadge tone={statusTone(ped.status)}>
                {ped.status}
              </NeptiveBadge>
            </div>
            <div className="text-[12px] text-newTableText">
              {ped.periodStart?.slice(0, 10)} → {ped.periodEnd?.slice(0, 10)}
            </div>
            {ped.objectives && (
              <div className="text-[13px] mt-[6px] whitespace-pre-wrap">
                {ped.objectives}
              </div>
            )}
            <ul className="mt-[8px] text-[13px] list-disc pl-[18px]">
              {(ped.items || []).map((item: any) => (
                <li key={item.id} className="flex items-start justify-between gap-[8px]">
                  <span>{item.title}</span>
                  <button
                    className="text-[11px] text-newTableText"
                    onClick={() => removeItem(ped.id, item.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-[6px] mt-[8px]">
              <input
                className={fieldClass}
                placeholder="Add planned item"
                value={itemDrafts[ped.id] || ''}
                onChange={(e) =>
                  setItemDrafts((current) => ({
                    ...current,
                    [ped.id]: e.target.value,
                  }))
                }
              />
              <Button onClick={() => addItem(ped.id)}>Add</Button>
            </div>
            <div className="flex gap-[6px] mt-[8px] flex-wrap">
              {nextPedActions(ped.status).map((action) => (
                <button
                  key={action.status}
                  className="text-[11px] px-[8px] h-[28px] rounded-[6px] bg-newBtnSimple"
                  onClick={() => transition(ped.id, action.status)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!data?.length && <NeptiveEmpty>No PEDs</NeptiveEmpty>}
      </NeptiveCard>
      <NeptiveCard title="New PED">
        <div className="flex flex-col gap-[8px]">
          <NeptiveField label="Name">
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
          </NeptiveField>
          <NeptiveField label="Start">
            <input className={fieldClass} type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </NeptiveField>
          <NeptiveField label="End">
            <input className={fieldClass} type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </NeptiveField>
          <NeptiveField label="Objectives">
            <textarea className={areaClass} value={objectives} onChange={(e) => setObjectives(e.target.value)} />
          </NeptiveField>
          <Button onClick={create}>Create PED</Button>
        </div>
      </NeptiveCard>
    </div>
  );
};

const ContentPanel = ({ customerId }: { customerId: string }) => {
  const { data } = useNeptiveAgencyList(customerId, 'posts?state=all');
  const posts = data?.posts || [];
  return (
    <NeptiveCard title="Client posts (from Postiz)">
      <div className="text-[12px] text-newTableText mb-[8px]">
        Publishing state is owned by Postiz. Use Approvals for client sign-off.
      </div>
      {posts.map((post: any) => (
        <div key={post.id} className="flex justify-between py-[8px] border-b border-newTableBorder gap-[12px]">
          <div>
            <div className="text-[13px] line-clamp-2">
              {postPreviewText(post.content) || 'Untitled post'}
            </div>
            <div className="text-[11px] text-newTableText">
              {post.integration?.providerIdentifier} · {formatWhen(post.publishDate)}
            </div>
          </div>
          <NeptiveBadge tone={statusTone(post.state)}>{post.state}</NeptiveBadge>
        </div>
      ))}
      {!posts.length && <NeptiveEmpty>No posts for this client</NeptiveEmpty>}
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
  const groups = [];
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
      toaster.show('Could not start approval', 'warning');
      return;
    }
    setPostGroup('');
    await mutate();
  }, [fetch, customerId, postGroup, groups, mutate, toaster]);

  const transition = useCallback(
    async (id: string, status: string, needsComment?: boolean) => {
      let comment: string | undefined;
      if (needsComment) {
        comment = window.prompt('Comment (required)') || '';
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
        toaster.show('Transition failed', 'warning');
        return;
      }
      await mutate();
    },
    [fetch, customerId, mutate, toaster]
  );

  return (
    <div className="flex flex-col gap-[12px]">
      <NeptiveCard title="Submit a draft group">
        <div className="flex gap-[8px]">
          <select
            className={fieldClass}
            value={postGroup}
            onChange={(e) => setPostGroup(e.target.value)}
          >
            <option value="">Select Postiz post</option>
            {groups.map((post: any) => (
              <option key={post.group} value={post.group}>
                {(postPreviewText(post.content) || 'Untitled').slice(0, 80)} · {post.state}
              </option>
            ))}
          </select>
          <Button onClick={create}>Create approval</Button>
        </div>
      </NeptiveCard>
      <NeptiveCard title="Approvals">
        {(data || []).map((row: any) => (
          <div key={row.id} className="py-[12px] border-b border-newTableBorder">
            <div className="flex items-center gap-[8px] flex-wrap">
              <div className="font-[600]">
                {row.title || row.post?.text || 'Content for approval'}
              </div>
              <NeptiveBadge tone={statusTone(row.status)}>{row.status}</NeptiveBadge>
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
        {!data?.length && <NeptiveEmpty>No approvals</NeptiveEmpty>}
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
      toaster.show('Could not save strategy entry', 'warning');
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
      <NeptiveCard title="Strategy">
        {(data || []).map((entry: any) => (
          <div key={entry.id} className="py-[10px] border-b border-newTableBorder">
            <div className="flex items-center justify-between gap-[8px]">
              <div className="text-[11px] text-newTableText">{entry.kind} · {entry.visibility}</div>
              <button className="text-[11px] text-newTableText" onClick={() => remove(entry.id)}>
                Remove
              </button>
            </div>
            <div className="font-[600]">{entry.title}</div>
            <div className="text-[13px] whitespace-pre-wrap">{entry.body}</div>
          </div>
        ))}
        {!data?.length && <NeptiveEmpty>No strategy entries</NeptiveEmpty>}
      </NeptiveCard>
      <NeptiveCard title="Add entry">
        <div className="flex flex-col gap-[8px]">
          <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            {['OBJECTIVE','AUDIENCE','POSITIONING','PILLAR','TONE','PLATFORM','PRIORITY','EXPERIMENT','CAMPAIGN','KPI','NOTE'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input className={fieldClass} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className={areaClass} placeholder="Body" value={body} onChange={(e) => setBody(e.target.value)} />
          <select className={fieldClass} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="CLIENT_VISIBLE">Client visible</option>
            <option value="INTERNAL">Internal only</option>
          </select>
          <Button onClick={create}>Save</Button>
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
      toaster.show('Could not log activity', 'warning');
      return;
    }
    setTitle('');
    setBody('');
    await mutate();
  }, [fetch, customerId, type, title, body, visibility, mutate, toaster]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[12px]">
      <NeptiveCard title="Work performed">
        {(data || []).map((item: any) => (
          <div key={item.id} className="py-[8px] border-b border-newTableBorder">
            <div className="text-[11px] text-newTableText">{item.type} · {item.source} · {item.visibility}</div>
            <div className="font-[600]">{item.title}</div>
            {item.body && <div className="text-[13px]">{item.body}</div>}
            <div className="text-[11px] text-newTableText">{formatWhen(item.occurredAt)}</div>
          </div>
        ))}
        {!data?.length && <NeptiveEmpty>No activities</NeptiveEmpty>}
      </NeptiveCard>
      <NeptiveCard title="Log activity">
        <div className="flex flex-col gap-[8px]">
          <select className={fieldClass} value={type} onChange={(e) => setType(e.target.value)}>
            {['PROFILE_OPTIMIZATION','COMPETITOR_ANALYSIS','CAMPAIGN_ADJUSTMENT','MEETING','CREATIVE_PRODUCTION','STRATEGY_UPDATE','REPORT_PREPARATION','WEBSITE_SOCIAL_INTERVENTION','OTHER'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input className={fieldClass} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className={areaClass} value={body} onChange={(e) => setBody(e.target.value)} />
          <select className={fieldClass} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="CLIENT_VISIBLE">Client visible</option>
            <option value="INTERNAL">Internal only</option>
          </select>
          <Button onClick={create}>Log work</Button>
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
      toaster.show('Could not save material', 'warning');
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
      <NeptiveCard title="Materials">
        {(data || []).map((item: any) => (
          <div key={item.id} className="py-[8px] border-b border-newTableBorder">
            <div className="flex items-center justify-between gap-[8px]">
              <div className="font-[600]">{item.title}</div>
              <button className="text-[11px] text-newTableText" onClick={() => remove(item.id)}>
                Remove
              </button>
            </div>
            <div className="text-[12px] text-newTableText">{item.kind} · {item.visibility}</div>
            {item.filePath && (
              <a className="text-[12px] underline" href={item.filePath} target="_blank" rel="noreferrer">
                Open
              </a>
            )}
          </div>
        ))}
        {!data?.length && <NeptiveEmpty>No materials</NeptiveEmpty>}
      </NeptiveCard>
      <NeptiveCard title="Add material">
        <div className="flex flex-col gap-[8px]">
          <input className={fieldClass} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            {['BRAND_GUIDELINES','REPORT_PDF','STRATEGY_DOCUMENT','RAW_PHOTO','CLIENT_MATERIAL','CAMPAIGN_ASSET','DELIVERABLE'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input className={fieldClass} placeholder="File URL or Postiz media path" value={filePath} onChange={(e) => setFilePath(e.target.value)} />
          <select className={fieldClass} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="CLIENT_VISIBLE">Client visible</option>
            <option value="INTERNAL">Internal only</option>
          </select>
          <Button onClick={create}>Save</Button>
        </div>
      </NeptiveCard>
    </div>
  );
};

const AnalyticsPanel = ({ customerId }: { customerId: string }) => {
  const { data } = useNeptiveAgencyList(customerId, 'analytics?date=30');
  return (
    <NeptiveCard title="Channel analytics (Postiz collectors)">
      {(data || []).map((row: any) => (
        <div key={row.integrationId} className="py-[8px] border-b border-newTableBorder">
          <div className="font-[600]">{row.name} · {row.provider}</div>
          <div className="text-[12px] text-newTableText">
            {Array.isArray(row.data) ? `${row.data.length} series` : 'No data'}
          </div>
        </div>
      ))}
      {!data?.length && <NeptiveEmpty>No connected channels</NeptiveEmpty>}
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
      toaster.show('Choose a start and end date', 'warning');
      return;
    }
    const response = await fetch(`/neptive/agency/clients/${customerId}/reports`, {
      method: 'POST',
      body: JSON.stringify({ periodStart, periodEnd, narrative }),
    });
    if (!response.ok) {
      toaster.show('Could not generate report', 'warning');
      return;
    }
    setNarrative('');
    await mutate();
  }, [fetch, customerId, periodStart, periodEnd, narrative, mutate, toaster]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[12px]">
      <NeptiveCard title="Reports">
        {(data || []).map((report: any) => {
          const snapshot = report.snapshot || {};
          return (
            <div key={report.id} className="py-[10px] border-b border-newTableBorder">
              <div className="font-[600]">{report.title}</div>
              <div className="flex items-center gap-[8px] mt-[4px]">
                <NeptiveBadge tone={statusTone(report.status)}>{report.status}</NeptiveBadge>
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
        {!data?.length && <NeptiveEmpty>No reports</NeptiveEmpty>}
      </NeptiveCard>
      <NeptiveCard title="Generate monthly summary">
        <div className="flex flex-col gap-[8px]">
          <input className={fieldClass} type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          <input className={fieldClass} type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          <textarea className={areaClass} placeholder="Narrative" value={narrative} onChange={(e) => setNarrative(e.target.value)} />
          <Button onClick={generate}>Publish report</Button>
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
      toaster.show('Could not create invite', 'warning');
      return;
    }
    if (body.url) {
      setInviteUrl(body.url);
      toaster.show('Invite created', 'success');
      try {
        await navigator.clipboard.writeText(body.url);
      } catch {}
    }
    setEmail('');
    setName('');
  }, [fetch, customerId, email, name, mutate, toaster]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[12px]">
      <NeptiveCard title="Client users">
        {(data?.users || []).map((user: any) => (
          <div key={user.id} className="py-[8px] border-b border-newTableBorder">
            <div className="font-[600]">{user.name}</div>
            <div className="text-[12px] text-newTableText">{user.email} · {user.role}</div>
          </div>
        ))}
        {!data?.users?.length && <NeptiveEmpty>No client users</NeptiveEmpty>}
      </NeptiveCard>
      <NeptiveCard title="Invite">
        <div className="flex flex-col gap-[8px]">
          <input className={fieldClass} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={fieldClass} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button onClick={invite}>Send magic link</Button>
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
