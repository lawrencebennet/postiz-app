'use client';

import { FC, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@gitroom/react/form/button';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  NeptiveBadge,
  areaClass,
  fieldClass,
  postPreviewText,
} from '@gitroom/frontend/components/neptive/neptive.ui';
import {
  PedCalendarItem,
  PedVariant,
  contentTypeLabel,
} from '@gitroom/frontend/components/neptive/ped-content-card';
import { PlatformPreviewSwitcher } from '@gitroom/frontend/components/neptive/preview/preview';

// ---------------------------------------------------------------- states

type Tone = 'neutral' | 'good' | 'warn' | 'bad';

export const VARIANT_STATES: Record<
  string,
  { short: string; long: string; tone: Tone }
> = {
  TO_REVIEW: { short: 'Da valutare', long: 'Da valutare', tone: 'warn' },
  CHANGES_REQUESTED: {
    short: 'Modifiche',
    long: 'Modifiche richieste',
    tone: 'bad',
  },
  CONFIRMED: { short: 'Confermata', long: 'Variante confermata', tone: 'good' },
  NOT_CHOSEN: { short: 'Non scelta', long: 'Non scelta', tone: 'neutral' },
  REJECTED: { short: 'Scartata', long: 'Scartata', tone: 'bad' },
  IN_PREPARATION: {
    short: 'In arrivo',
    long: 'In preparazione',
    tone: 'neutral',
  },
};

const stateOf = (variant?: PedVariant | null) =>
  VARIANT_STATES[variant?.state || 'IN_PREPARATION'] ||
  VARIANT_STATES.IN_PREPARATION;

const CHIP_TONE: Record<Tone, string> = {
  warn: 'border-amber-400/70 text-amber-200',
  bad: 'border-red-400/70 text-red-300',
  good: 'border-green-400 text-green-300 bg-green-900/30',
  neutral: 'border-newTableBorder text-newTableText',
};

const STATE_ICON: Record<string, string> = {
  CONFIRMED: '✓',
  CHANGES_REQUESTED: '✎',
  NOT_CHOSEN: '–',
  TO_REVIEW: '•',
  REJECTED: '×',
  IN_PREPARATION: '…',
};

// ---------------------------------------------------------------- dates

const asDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const slotDateParts = (value?: string | null) => {
  const date = asDate(value);
  if (!date) return null;
  return {
    weekday: new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(date),
    day: new Intl.DateTimeFormat('it-IT', { day: 'numeric' }).format(date),
    month: new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(date),
    time: new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(date),
  };
};

const shortDateTime = (value?: string | null) => {
  const date = asDate(value);
  return date
    ? new Intl.DateTimeFormat('it-IT', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
    : '';
};

export const slotScheduledAt = (item: PedCalendarItem) =>
  item.content?.scheduledAt || '';

export const sortSlotsByDate = (items: PedCalendarItem[]) =>
  items
    .slice()
    .sort((a, b) => {
      const left = slotScheduledAt(a);
      const right = slotScheduledAt(b);
      if (!left) return 1;
      if (!right) return -1;
      return left.localeCompare(right);
    });

const defaultSelection = (item: PedCalendarItem) => {
  const variants = item.variants || [];
  return (
    variants.find((variant) => variant.id === item.slot?.confirmedVariantId)
      ?.id ||
    variants.find((variant) => variant.state === 'TO_REVIEW')?.id ||
    variants[0]?.id ||
    ''
  );
};

// ---------------------------------------------------------------- switcher

export const VariantSwitcher: FC<{
  variants: PedVariant[];
  selectedId: string;
  onSelect: (id: string) => void;
  slotId: string;
}> = ({ variants, selectedId, onSelect, slotId }) => (
  <div
    role="tablist"
    aria-label="Varianti di questo contenuto"
    className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-[6px]"
  >
    {variants.map((variant) => {
      const meta = stateOf(variant);
      const selected = variant.id === selectedId;
      return (
        <button
          key={variant.id}
          type="button"
          role="tab"
          id={`tab-${slotId}-${variant.id}`}
          aria-selected={selected}
          aria-label={`Variante ${variant.label}: ${meta.long}`}
          onClick={() => onSelect(variant.id)}
          className={clsx(
            'min-h-[52px] rounded-[10px] border px-[4px] py-[5px] flex flex-col items-center justify-center gap-[2px] transition-colors',
            CHIP_TONE[meta.tone],
            selected
              ? 'ring-2 ring-textColor ring-offset-2 ring-offset-newBgColorInner'
              : 'hover:bg-newBoxHover',
            variant.state === 'NOT_CHOSEN' && !selected && 'opacity-55'
          )}
        >
          <span className="text-[17px] font-[800] leading-none text-textColor">
            {variant.label}
          </span>
          <span className="text-[10px] font-[600] leading-tight whitespace-nowrap">
            {STATE_ICON[variant.state] || ''} {meta.short}
          </span>
        </button>
      );
    })}
  </div>
);

// ---------------------------------------------------------------- pieces

const SectionLabel: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="text-[11px] uppercase tracking-[0.08em] text-newTableText mb-[5px]">
    {children}
  </div>
);

const Comments: FC<{ variant: PedVariant; mode: 'client' | 'agency' }> = ({
  variant,
  mode,
}) => {
  const comments = variant.approval?.comments || [];
  if (!comments.length) {
    return (
      <div className="text-[12px] text-newTableText">
        Nessun commento su questa variante.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-[6px]">
      {comments.map((entry) => (
        <li
          key={entry.id}
          className={clsx(
            'rounded-[8px] px-[10px] py-[7px] text-[13px] break-words',
            entry.authorType === 'CLIENT_USER'
              ? 'bg-newBgColor border border-newTableBorder'
              : 'bg-boxFocused/40'
          )}
        >
          <div className="text-[11px] text-newTableText mb-[2px] flex flex-wrap gap-x-[6px]">
            <span className="font-[700] text-textColor">{entry.authorName}</span>
            <span>{shortDateTime(entry.createdAt)}</span>
            {mode === 'agency' && entry.visibility === 'INTERNAL' && (
              <span className="text-amber-200">interno</span>
            )}
          </div>
          <div className="whitespace-pre-wrap">{entry.body}</div>
        </li>
      ))}
    </ul>
  );
};

const StatusBanner: FC<{ item: PedCalendarItem; variant: PedVariant }> = ({
  item,
  variant,
}) => {
  const confirmed = (item.variants || []).find(
    (entry) => entry.id === item.slot?.confirmedVariantId
  );
  // a single-post date reads like before: no "variant" wording, no banner while not submitted
  if ((item.variants || []).length < 2) {
    if (variant.state === 'CONFIRMED') {
      return (
        <div className="rounded-[10px] border border-green-500/60 bg-green-900/25 px-[12px] py-[9px] text-[13px] text-green-200">
          <strong>Contenuto approvato</strong>
          {variant.approval?.approvedAt ? ` il ${shortDateTime(variant.approval.approvedAt)}` : ''}.
        </div>
      );
    }
    if (variant.state === 'CHANGES_REQUESTED') {
      return (
        <div className="rounded-[10px] border border-red-400/50 bg-red-900/20 px-[12px] py-[9px] text-[13px] text-red-200">
          <strong>Modifiche richieste.</strong> Neptive sta lavorando a questo contenuto.
        </div>
      );
    }
    return null;
  }
  if (variant.state === 'CONFIRMED') {
    return (
      <div className="rounded-[10px] border border-green-500/60 bg-green-900/25 px-[12px] py-[9px] text-[13px] text-green-200">
        <strong>Variante {variant.label} confermata</strong>
        {item.slot?.confirmedAt ? ` il ${shortDateTime(item.slot.confirmedAt)}` : ''}.
        {(item.variants || []).length > 1 &&
          ' Le altre varianti restano visibili come storico.'}
      </div>
    );
  }
  if (variant.state === 'NOT_CHOSEN') {
    return (
      <div className="rounded-[10px] border border-newTableBorder bg-newBgColor px-[12px] py-[9px] text-[13px] text-newTableText">
        <strong className="text-textColor">Variante non scelta.</strong> È stata
        confermata la variante {confirmed?.label || ''}: questa resta qui in sola
        lettura, con i suoi commenti.
      </div>
    );
  }
  if (variant.state === 'CHANGES_REQUESTED') {
    return (
      <div className="rounded-[10px] border border-red-400/50 bg-red-900/20 px-[12px] py-[9px] text-[13px] text-red-200">
        <strong>Modifiche richieste.</strong> Neptive sta lavorando a questa
        variante; puoi comunque valutare le altre.
      </div>
    );
  }
  if (variant.state === 'IN_PREPARATION') {
    return (
      <div className="rounded-[10px] border border-newTableBorder px-[12px] py-[9px] text-[13px] text-newTableText">
        Questa variante non è ancora pronta per la tua approvazione.
      </div>
    );
  }
  return null;
};

// ---------------------------------------------------------------- client actions

const usePortalAction = (onDone: () => Promise<unknown> | void) => {
  const fetch = useFetch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const call = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      setBusy(true);
      setError('');
      try {
        const response = await fetch(path, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          setError(
            response.status === 403
              ? 'Questa variante non è più modificabile. Ricarica la pagina.'
              : 'Non è stato possibile completare l’azione. Riprova.'
          );
          return false;
        }
        await onDone();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [fetch, onDone]
  );
  return { call, busy, error, setError };
};

const ClientComment: FC<{
  variant: PedVariant;
  onDone: () => Promise<unknown> | void;
}> = ({ variant, onDone }) => {
  const { call, busy, error, setError } = usePortalAction(onDone);
  const [comment, setComment] = useState('');
  useEffect(() => {
    setComment('');
    setError('');
  }, [variant.id, setError]);
  const approvalId = variant.approval?.id;
  if (!approvalId || !variant.client?.canComment) return null;
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="sr-only" htmlFor={`comment-${variant.id}`}>
        Commento sulla variante {variant.label}
      </label>
      <textarea
        id={`comment-${variant.id}`}
        className={clsx(areaClass, '!min-h-[64px] w-full')}
        placeholder={`Scrivi un commento sulla variante ${variant.label}`}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
      {comment.trim() && (
        <button
          type="button"
          disabled={busy}
          className="self-start text-[13px] font-[600] px-[14px] h-[40px] rounded-[8px] bg-newBtnSimple"
          onClick={async () => {
            if (
              await call(`/neptive/portal/approvals/${approvalId}/comments`, {
                body: comment.trim(),
              })
            ) {
              setComment('');
            }
          }}
        >
          Invia commento
        </button>
      )}
      {error && (
        <div role="alert" className="text-[13px] text-red-300">
          {error}
        </div>
      )}
    </div>
  );
};

/**
 * Approve / request changes. Rendered twice by the slot card: as a sticky bar at
 * the bottom of the slot on phones (thumb reach while scrolling the preview) and
 * inside the right column on desktop. Only one is visible at a time.
 */
const DecisionBar: FC<{
  variant: PedVariant;
  onDone: () => Promise<unknown> | void;
  className?: string;
}> = ({ variant, onDone, className }) => {
  const { call, busy, error, setError } = usePortalAction(onDone);
  const [mode, setMode] = useState<'idle' | 'changes'>('idle');
  const [note, setNote] = useState('');
  useEffect(() => {
    setMode('idle');
    setNote('');
    setError('');
  }, [variant.id, setError]);
  const approvalId = variant.approval?.id;
  if (!approvalId || !variant.client?.canDecide) return null;
  const transition = (body: Record<string, unknown>) =>
    call(`/neptive/portal/approvals/${approvalId}/transition`, body);

  return (
    <div className={className}>
      {mode === 'changes' ? (
        <div className="flex flex-col gap-[8px]">
          <label
            htmlFor={`changes-${variant.id}`}
            className="text-[12px] text-newTableText"
          >
            Cosa vuoi cambiare nella variante {variant.label}?
          </label>
          <textarea
            id={`changes-${variant.id}`}
            autoFocus
            className={clsx(areaClass, 'w-full')}
            placeholder="Es. accorcia l’inizio, cambia la prima riga della caption…"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-[8px]">
            <Button
              secondary
              className="!h-[48px] !px-[10px] rounded-[10px] text-[15px] whitespace-nowrap"
              onClick={() => setMode('idle')}
              disabled={busy}
            >
              Annulla
            </Button>
            <Button
              className="!h-[48px] !px-[10px] rounded-[10px] text-[15px] whitespace-nowrap"
              disabled={busy || !note.trim()}
              onClick={async () => {
                if (await transition({ status: 'CHANGES_REQUESTED', comment: note.trim() })) {
                  setNote('');
                  setMode('idle');
                }
              }}
            >
              Invia richiesta
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-[8px]">
            <Button
              secondary
              className="!h-[48px] !px-[10px] rounded-[10px] text-[15px] whitespace-nowrap"
              disabled={busy}
              onClick={() => setMode('changes')}
            >
              Richiedi modifiche
            </Button>
            <Button
              className="!h-[48px] !px-[10px] rounded-[10px] text-[15px] whitespace-nowrap"
              disabled={busy}
              onClick={() => transition({ status: 'APPROVED' })}
            >
              Approva {variant.label}
            </Button>
          </div>
          <div className="text-[11px] text-newTableText mt-[6px] text-center lg:text-left">
            Approvando la variante {variant.label} la confermi per questa data;
            le altre restano visibili come storico.
          </div>
        </>
      )}
      {error && (
        <div role="alert" className="text-[13px] text-red-300 mt-[6px]">
          {error}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- agency tools

export type AgencySlotApi = {
  customerId: string;
  planId: string;
  attachOptions: Array<{ group: string; label: string }>;
  onChanged: () => Promise<unknown> | void;
  notify: (message: string, kind?: 'success' | 'warning') => void;
};

const AgencyTools: FC<{
  item: PedCalendarItem;
  variant: PedVariant | undefined;
  api: AgencySlotApi;
  onSelect: (id: string) => void;
}> = ({ item, variant, api, onSelect }) => {
  const fetch = useFetch();
  const [group, setGroup] = useState('');
  const [busy, setBusy] = useState(false);
  const base = `/neptive/agency/clients/${api.customerId}/peds/${api.planId}/items/${item.id}`;
  const variants = item.variants || [];
  const explicit = item.slot?.mode === 'VARIANTS';
  const confirmed = item.slot?.state === 'CONFIRMED';

  const run = useCallback(
    async (
      method: string,
      path: string,
      body?: Record<string, unknown>,
      success?: string
    ) => {
      setBusy(true);
      try {
        const response = await fetch(path, {
          method,
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          api.notify(data?.message || 'Operazione non riuscita', 'warning');
          return null;
        }
        if (success) api.notify(success, 'success');
        const data = await response.json().catch(() => null);
        await api.onChanged();
        return data;
      } finally {
        setBusy(false);
      }
    },
    [api, fetch]
  );

  const used = new Set(variants.map((entry) => entry.postGroup));
  const options = api.attachOptions.filter((option) => !used.has(option.group));
  const index = variant ? variants.findIndex((entry) => entry.id === variant.id) : -1;

  const move = (delta: number) => {
    if (!variant || index < 0) return;
    const ids = variants.map((entry) => entry.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run('POST', `${base}/variants/reorder`, { variantIds: ids });
  };

  return (
    <section className="rounded-[10px] border border-dashed border-newTableBorder p-[12px] flex flex-col gap-[10px]">
      <div className="text-[11px] uppercase tracking-[0.08em] text-newTableText">
        Decisioni del cliente e gestione varianti
      </div>
      {variants.length > 0 && (
        <ul className="flex flex-col divide-y divide-newTableBorder text-[13px]">
          {variants.map((entry) => {
            const meta = stateOf(entry);
            const last = [...(entry.approval?.comments || [])]
              .reverse()
              .find((comment) => comment.authorType === 'CLIENT_USER');
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onSelect(entry.id)}
                  className={clsx(
                    'w-full text-left py-[6px] flex flex-wrap items-baseline gap-x-[10px] gap-y-[2px]',
                    entry.id === variant?.id && 'font-[600]'
                  )}
                >
                  <span className="w-[28px] font-[800]">{entry.label}</span>
                  <NeptiveBadge tone={meta.tone}>{meta.long}</NeptiveBadge>
                  <span className="text-[12px] text-newTableText">
                    {entry.approval ? `approvazione: ${entry.approval.status}` : 'nessuna approvazione'}
                  </span>
                  {last && (
                    <span className="basis-full sm:basis-auto text-[12px] text-newTableText truncate max-w-full">
                      ultima nota cliente: “{last.body}”
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {variant && (
        <div className="flex flex-wrap gap-[6px]">
          {variant.agency?.canSendToClient && (
            <button
              type="button"
              disabled={busy}
              className="text-[12px] px-[10px] h-[32px] rounded-[6px] bg-forth text-white"
              onClick={() =>
                run(
                  'POST',
                  `${base}/send-to-client`,
                  { variantId: variant.id },
                  `Variante ${variant.label} inviata al cliente`
                )
              }
            >
              Invia {variant.label} al cliente
            </button>
          )}
          {explicit && !variant.implicit && (
            <>
              <button
                type="button"
                disabled={busy}
                className="text-[12px] px-[10px] h-[32px] rounded-[6px] bg-newBtnSimple"
                onClick={() => {
                  const label = window.prompt('Nuova etichetta (max 12 caratteri)', variant.label);
                  if (label && label.trim() && label.trim() !== variant.label) {
                    run('PUT', `${base}/variants/${variant.id}`, { label: label.trim() });
                  }
                }}
              >
                Rinomina
              </button>
              <button
                type="button"
                disabled={busy || index <= 0}
                aria-label="Sposta a sinistra"
                className="text-[12px] px-[10px] h-[32px] rounded-[6px] bg-newBtnSimple disabled:opacity-40"
                onClick={() => move(-1)}
              >
                ← Sposta
              </button>
              <button
                type="button"
                disabled={busy || index < 0 || index >= variants.length - 1}
                aria-label="Sposta a destra"
                className="text-[12px] px-[10px] h-[32px] rounded-[6px] bg-newBtnSimple disabled:opacity-40"
                onClick={() => move(1)}
              >
                Sposta →
              </button>
              {variant.agency?.canRemove && (
                <button
                  type="button"
                  disabled={busy}
                  className="text-[12px] px-[10px] h-[32px] rounded-[6px] bg-red-900/50 text-red-200"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Rimuovere la variante ${variant.label}? Il post resta in Postiz ma non verrà mai pubblicato da questo slot.`
                      )
                    ) {
                      run('DELETE', `${base}/variants/${variant.id}`, undefined, `Variante ${variant.label} rimossa`);
                    }
                  }}
                >
                  Rimuovi
                </button>
              )}
            </>
          )}
          {confirmed && (
            <button
              type="button"
              disabled={busy}
              className="text-[12px] px-[10px] h-[32px] rounded-[6px] bg-amber-900/50 text-amber-100"
              onClick={() => {
                const comment = window.prompt('Riapri la scelta: nota per lo storico (facoltativa)', '');
                if (comment === null) return;
                run('POST', `${base}/reopen`, { comment }, 'Scelta riaperta');
              }}
            >
              Riapri la scelta
            </button>
          )}
        </div>
      )}
      {variant?.approval?.actions?.length ? (
        <details className="text-[12px] text-newTableText">
          <summary className="cursor-pointer">Storico decisioni variante {variant.label}</summary>
          <ul className="mt-[6px] flex flex-col gap-[3px]">
            {variant.approval.actions.map((action, idx) => (
              <li key={idx}>
                {shortDateTime(action.createdAt)} · {action.action} ·{' '}
                {action.actorType === 'CLIENT_USER' ? 'cliente' : action.actorType === 'AGENCY_USER' ? 'agenzia' : 'sistema'}
                {action.comment ? ` — ${action.comment}` : ''}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {!confirmed && (
        <div className="flex flex-col sm:flex-row gap-[8px] sm:items-end">
          <label className="flex-1 flex flex-col gap-[4px] text-[12px] text-newTableText min-w-0">
            Aggiungi un post esistente come nuova variante
            <select
              className={clsx(fieldClass, 'w-full min-w-0')}
              value={group}
              onChange={(event) => setGroup(event.target.value)}
            >
              <option value="">Scegli un post del cliente</option>
              {options.map((option) => (
                <option key={option.group} value={option.group}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={busy || !group}
            onClick={async () => {
              const data = await run(
                'POST',
                `${base}/variants`,
                { postGroup: group },
                'Variante aggiunta'
              );
              if (data) {
                setGroup('');
                const added = (data.variants || []).find(
                  (entry: PedVariant) => entry.postGroup === group
                );
                if (added) onSelect(added.id);
              }
            }}
          >
            + Variante
          </Button>
        </div>
      )}
      {!!item.removedVariants?.length && (
        <div className="text-[11px] text-newTableText">
          Rimosse (non pubblicabili da questo slot):{' '}
          {item.removedVariants.map((entry) => entry.label).join(', ')}
        </div>
      )}
    </section>
  );
};

// ---------------------------------------------------------------- slot card

export const PedSlotCard: FC<{
  item: PedCalendarItem;
  mode: 'client' | 'agency';
  previewIdentity?: unknown;
  onChanged: () => Promise<unknown> | void;
  agency?: AgencySlotApi;
  className?: string;
}> = ({ item, mode, previewIdentity, onChanged, agency, className }) => {
  const variants = item.variants || [];
  const [selectedId, setSelectedId] = useState(() => defaultSelection(item));

  useEffect(() => {
    if (!variants.some((variant) => variant.id === selectedId)) {
      setSelectedId(defaultSelection(item));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const selected = variants.find((variant) => variant.id === selectedId) || variants[0];
  const content = selected?.content || item.content || null;
  const date = slotDateParts(content?.scheduledAt);
  const multiple = variants.length > 1;
  const confirmed = variants.find((variant) => variant.id === item.slot?.confirmedVariantId);
  const toReview = variants.filter((variant) => variant.state === 'TO_REVIEW').length;
  const receded = selected?.state === 'NOT_CHOSEN';

  const slotBadge = useMemo(() => {
    if (confirmed) {
      return {
        tone: 'good' as const,
        text: multiple ? `Confermata: variante ${confirmed.label}` : 'Approvato',
      };
    }
    if (multiple) {
      return {
        tone: toReview ? ('warn' as const) : ('neutral' as const),
        text: toReview
          ? `Scegli tra ${variants.length} varianti`
          : `${variants.length} varianti`,
      };
    }
    if (selected && selected.state !== 'IN_PREPARATION') {
      return { tone: stateOf(selected).tone, text: stateOf(selected).long };
    }
    return null;
  }, [confirmed, multiple, selected, toReview, variants.length]);

  return (
    <article
      id={`slot-${item.id}`}
      aria-labelledby={`slot-title-${item.id}`}
      className={clsx(
        'scroll-mt-[16px] bg-newBgColorInner border rounded-[14px] p-[12px] md:p-[18px] flex flex-col gap-[12px] min-w-0',
        confirmed ? 'border-green-700/60' : 'border-newTableBorder',
        className
      )}
    >
      <header className="flex items-start gap-[12px] min-w-0">
        <div className="shrink-0 w-[64px] rounded-[10px] bg-newBgColor border border-newTableBorder text-center py-[6px]">
          {date ? (
            <>
              <div className="text-[11px] uppercase text-newTableText leading-none">
                {date.weekday}
              </div>
              <div className="text-[26px] font-[800] leading-[1.05]">{date.day}</div>
              <div className="text-[11px] uppercase text-newTableText leading-none">
                {date.month}
              </div>
            </>
          ) : (
            <div className="text-[11px] text-newTableText px-[4px] py-[10px]">
              Data da definire
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px] text-[13px]">
            {date && <span className="text-[18px] font-[800]">ore {date.time}</span>}
            {content?.platform && (
              <span className="inline-flex items-center gap-[5px] text-newTableText min-w-0">
                <img
                  src={`/icons/platforms/${content.platform}.png`}
                  alt=""
                  className="h-[16px] w-[16px] shrink-0"
                />
                <span className="truncate">{content.channel || content.platform}</span>
              </span>
            )}
            <span className="text-newTableText">· {contentTypeLabel(content?.contentType)}</span>
          </div>
          <h3 id={`slot-title-${item.id}`} className="text-[16px] font-[700] leading-snug break-words mt-[2px]">
            {item.title || content?.title || 'Contenuto'}
          </h3>
          {slotBadge && (
            <div className="mt-[4px]">
              <NeptiveBadge tone={slotBadge.tone}>{slotBadge.text}</NeptiveBadge>
            </div>
          )}
        </div>
      </header>

      {mode === 'agency' && item.notes && (
        <div className="text-[12px] text-newTableText whitespace-pre-wrap">
          Nota interna: {item.notes}
        </div>
      )}

      {(multiple || mode === 'agency') && variants.length > 0 && (
        <VariantSwitcher
          variants={variants}
          selectedId={selected?.id || ''}
          onSelect={setSelectedId}
          slotId={item.id}
        />
      )}

      {mode === 'agency' && agency && (
        <AgencyTools item={item} variant={selected} api={agency} onSelect={setSelectedId} />
      )}

      {!selected ? (
        <div className="rounded-[10px] border border-newTableBorder p-[16px] text-[13px] text-newTableText">
          {item.linkStatus === 'MISSING'
            ? 'Contenuto non disponibile.'
            : 'Nessun contenuto ancora collegato a questa data.'}
        </div>
      ) : (
        <div
          role="tabpanel"
          aria-labelledby={`tab-${item.id}-${selected.id}`}
          className="flex flex-col gap-[12px] min-w-0"
        >
          {(multiple || selected.state !== 'TO_REVIEW') && (
            <StatusBanner item={item} variant={selected} />
          )}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] gap-[16px] min-w-0">
            <div
              className={clsx(
                'min-w-0 transition-opacity',
                receded && 'opacity-50 grayscale-[60%]'
              )}
            >
              {selected.content ? (
                <PlatformPreviewSwitcher
                  content={selected.content as any}
                  identity={previewIdentity}
                />
              ) : (
                <div className="rounded-[10px] bg-black min-h-[200px] flex items-center justify-center text-[13px] text-white/70">
                  Anteprima non disponibile
                </div>
              )}
            </div>
            <div className="flex flex-col gap-[14px] min-w-0">
              <section className={clsx(receded && 'opacity-70')}>
                <SectionLabel>
                  {multiple ? `Testo · variante ${selected.label}` : 'Testo del post'}
                </SectionLabel>
                <div className="rounded-[8px] bg-newBgColor p-[10px] text-[14px] whitespace-pre-wrap break-words max-h-[320px] overflow-y-auto">
                  {selected.content?.caption || 'Nessuna caption'}
                </div>
              </section>
              <section>
                <SectionLabel>Commenti</SectionLabel>
                <Comments variant={selected} mode={mode} />
              </section>
              {mode === 'client' && (
                <>
                  <ClientComment variant={selected} onDone={onChanged} />
                  <DecisionBar variant={selected} onDone={onChanged} className="hidden lg:block" />
                </>
              )}
            </div>
          </div>
          {mode === 'client' && (
            // phones: direct child of the tab panel, so `sticky bottom-0` keeps the two
            // actions at the bottom of the screen for as long as this variant is on screen
            <DecisionBar
              variant={selected}
              onDone={onChanged}
              className="lg:hidden sticky bottom-0 z-[5] -mx-[12px] md:-mx-[18px] px-[12px] md:px-[18px] pt-[10px] pb-[calc(10px+env(safe-area-inset-bottom))] bg-newBgColorInner/95 backdrop-blur border-t border-newTableBorder"
            />
          )}
        </div>
      )}

    </article>
  );
};

// ---------------------------------------------------------------- feed

export const PedSlotFeed: FC<{
  items: PedCalendarItem[];
  mode: 'client' | 'agency';
  previewIdentity?: unknown;
  onChanged: () => Promise<unknown> | void;
}> = ({ items, mode, previewIdentity, onChanged }) => {
  const sorted = useMemo(() => sortSlotsByDate(items), [items]);
  if (!sorted.length) {
    return (
      <div className="text-[13px] text-newTableText py-[12px]">
        Nessun contenuto in questo piano.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[14px] min-w-0">
      {sorted.map((item) => (
        <PedSlotCard
          key={item.id}
          item={item}
          mode={mode}
          previewIdentity={previewIdentity}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
};

export const scrollToSlot = (item: PedCalendarItem) => {
  document
    .getElementById(`slot-${item.id}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export const attachOptionsFromPosts = (posts: any[]) =>
  Array.from(
    new Map(
      (posts || [])
        .filter((post: any) => post.group && post.state !== 'PUBLISHED' && !post.parentPostId)
        .map((post: any) => [
          post.group,
          {
            group: post.group,
            label: `${(postPreviewText(post.content) || 'Senza testo').slice(0, 60)} · ${shortDateTime(post.publishDate)} · ${post.state}`,
          },
        ])
    ).values()
  );
