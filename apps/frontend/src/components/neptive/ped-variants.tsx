'use client';

import { FC, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  NeptiveBadge,
  areaClass,
  fieldClass,
  kindLabel,
  postPreviewText,
  statusLabel,
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

// state of a variant chip: the confirmed one is solid green, the others outlined; the receded ones dashed
const CHIP_STATE: Record<string, string> = {
  CONFIRMED: 'nx-chip--confirmed',
  CHANGES_REQUESTED: 'nx-chip--changes',
  NOT_CHOSEN: 'nx-chip--receded',
  REJECTED: 'nx-chip--receded',
  TO_REVIEW: 'nx-chip--review',
  IN_PREPARATION: 'nx-chip--pending',
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
    className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-[6px] min-w-0"
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
          className={clsx('nx-chip', CHIP_STATE[variant.state] || 'nx-chip--pending', selected && 'nx-chip--selected')}
        >
          <span className="nx-chip__label">{variant.label}</span>
          <span className="nx-chip__state">
            <span aria-hidden="true">{STATE_ICON[variant.state] || ''}</span> {meta.short}
          </span>
        </button>
      );
    })}
  </div>
);

// ---------------------------------------------------------------- pieces

const SectionLabel: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="nx-label mb-[7px]">{children}</div>
);

const Comments: FC<{
  variant: PedVariant;
  mode: 'client' | 'agency';
  multiple: boolean;
}> = ({ variant, mode, multiple }) => {
  const comments = variant.approval?.comments || [];
  if (!comments.length) {
    return (
      <div className="text-[14px] text-[var(--nx-text-muted)]">
        {multiple ? 'Nessun commento su questa variante.' : 'Nessun commento.'}
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-[6px]">
      {comments.map((entry) => (
        <li
          key={entry.id}
          className={clsx(
            'rounded-[var(--nx-r)] px-[12px] py-[9px] text-[14px] leading-[1.45] break-words',
            entry.authorType === 'CLIENT_USER'
              ? 'border border-[var(--nx-line-strong)]'
              : 'bg-[var(--nx-surface-2)]'
          )}
        >
          <div className="nx-label mb-[3px] flex flex-wrap gap-x-[8px]">
            <span className="!text-[var(--nx-text)]">{entry.authorName}</span>
            <span>{shortDateTime(entry.createdAt)}</span>
            {mode === 'agency' && entry.visibility === 'INTERNAL' && (
              <span className="!text-[var(--nx-warn)]">interno</span>
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
        <div className="nx-banner" data-tone="good">
          <strong>Contenuto approvato</strong>
          {variant.approval?.approvedAt ? ` il ${shortDateTime(variant.approval.approvedAt)}` : ''}.
        </div>
      );
    }
    if (variant.state === 'CHANGES_REQUESTED') {
      return (
        <div className="nx-banner" data-tone="bad">
          <strong>Modifiche richieste.</strong> Neptive sta lavorando a questo contenuto.
        </div>
      );
    }
    return null;
  }
  if (variant.state === 'CONFIRMED') {
    return (
      <div className="nx-banner" data-tone="good">
        <strong>Variante {variant.label} confermata</strong>
        {item.slot?.confirmedAt ? ` il ${shortDateTime(item.slot.confirmedAt)}` : ''}.
        {(item.variants || []).length > 1 &&
          ' Le altre varianti restano visibili come storico.'}
      </div>
    );
  }
  if (variant.state === 'NOT_CHOSEN') {
    return (
      <div className="nx-banner" data-tone="receded">
        <strong>Variante non scelta.</strong> È stata
        confermata la variante {confirmed?.label || ''}: questa resta qui in sola
        lettura, con i suoi commenti.
      </div>
    );
  }
  if (variant.state === 'CHANGES_REQUESTED') {
    return (
      <div className="nx-banner" data-tone="bad">
        <strong>Modifiche richieste.</strong> Neptive sta lavorando a questa
        variante; puoi comunque valutare le altre.
      </div>
    );
  }
  if (variant.state === 'IN_PREPARATION') {
    return (
      <div className="nx-banner" data-tone="receded">
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
  multiple: boolean;
  onDone: () => Promise<unknown> | void;
}> = ({ variant, multiple, onDone }) => {
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
        className={clsx(areaClass, '!min-h-[72px] w-full')}
        placeholder={multiple ? `Scrivi un commento sulla variante ${variant.label}` : 'Scrivi un commento'}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
      {comment.trim() && (
        <button
          type="button"
          disabled={busy}
          className="nx-btn self-start"
          data-size="sm"
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
        <div role="alert" className="text-[13px] text-[var(--nx-bad)]">
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
  multiple: boolean;
  onDone: () => Promise<unknown> | void;
  className?: string;
}> = ({ variant, multiple, onDone, className }) => {
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
            className="nx-label"
          >
            {multiple ? `Cosa vuoi cambiare nella variante ${variant.label}?` : 'Cosa vuoi cambiare?'}
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
            <button
              type="button"
              className="nx-btn !px-[10px]"
              onClick={() => setMode('idle')}
              disabled={busy}
            >
              Annulla
            </button>
            <button
              type="button"
              data-variant="primary"
              className="nx-btn !px-[10px]"
              disabled={busy || !note.trim()}
              onClick={async () => {
                if (await transition({ status: 'CHANGES_REQUESTED', comment: note.trim() })) {
                  setNote('');
                  setMode('idle');
                }
              }}
            >
              Invia richiesta
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-[8px]">
            <button
              type="button"
              className="nx-btn !px-[10px]"
              disabled={busy}
              onClick={() => setMode('changes')}
            >
              Richiedi modifiche
            </button>
            <button
              type="button"
              data-variant="primary"
              className="nx-btn !px-[10px]"
              disabled={busy}
              onClick={() => transition({ status: 'APPROVED' })}
            >
              {multiple ? `Approva ${variant.label}` : 'Approva'}
            </button>
          </div>
          {multiple && (
            <div className="text-[12px] leading-[1.4] text-[var(--nx-text-muted)] mt-[8px] text-center lg:text-left">
              Approvando la variante {variant.label} la confermi per questa data;
              le altre restano visibili come storico.
            </div>
          )}
        </>
      )}
      {error && (
        <div role="alert" className="text-[13px] text-[var(--nx-bad)] mt-[6px]">
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
    <section className="rounded-[var(--nx-r)] border border-dashed border-[var(--nx-line-strong)] p-[12px] flex flex-col gap-[10px] min-w-0">
      <div className="nx-label">
        Decisioni del cliente e gestione varianti
      </div>
      {variants.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--nx-line)] text-[13px]">
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
                  <span className="w-[28px] nx-heading text-[17px]">{entry.label}</span>
                  <NeptiveBadge tone={meta.tone}>{meta.long}</NeptiveBadge>
                  <span className="text-[12px] text-[var(--nx-text-muted)]">
                    {entry.approval ? `approvazione: ${statusLabel(entry.approval.status).toLowerCase()}` : 'nessuna approvazione'}
                  </span>
                  {last && (
                    <span className="basis-full sm:basis-auto text-[12px] text-[var(--nx-text-muted)] truncate max-w-full">
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
              data-variant="primary"
              data-size="sm"
              className="nx-btn"
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
                data-size="sm"
                className="nx-btn"
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
                data-size="sm"
                className="nx-btn"
                onClick={() => move(-1)}
              >
                ← Sposta
              </button>
              <button
                type="button"
                disabled={busy || index < 0 || index >= variants.length - 1}
                aria-label="Sposta a destra"
                data-size="sm"
                className="nx-btn"
                onClick={() => move(1)}
              >
                Sposta →
              </button>
              {variant.agency?.canRemove && (
                <button
                  type="button"
                  disabled={busy}
                  data-size="sm"
                  className="nx-btn !text-[var(--nx-bad)] !border-[color:var(--nx-bad)]"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Rimuovere la variante ${variant.label}? Il post resta nel calendario ma non verrà mai pubblicato da questo slot.`
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
              data-size="sm"
              className="nx-btn !text-[var(--nx-warn)] !border-[color:var(--nx-warn)]"
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
        <details className="text-[12px] text-[var(--nx-text-muted)]">
          <summary className="cursor-pointer">Storico decisioni variante {variant.label}</summary>
          <ul className="mt-[6px] flex flex-col gap-[3px]">
            {variant.approval.actions.map((action, idx) => (
              <li key={idx}>
                {shortDateTime(action.createdAt)} · {kindLabel(action.action) || action.action} ·{' '}
                {action.actorType === 'CLIENT_USER' ? 'cliente' : action.actorType === 'AGENCY_USER' ? 'agenzia' : 'sistema'}
                {action.comment ? ` — ${action.comment}` : ''}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {!confirmed && (
        <div className="flex flex-col sm:flex-row gap-[8px] sm:items-end">
          <label className="flex-1 flex flex-col gap-[6px] nx-label min-w-0">
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
          <button
            type="button"
            data-variant="primary"
            className="nx-btn !min-h-[42px]"
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
          </button>
        </div>
      )}
      {!!item.removedVariants?.length && (
        <div className="nx-label">
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
        'nx-slot scroll-mt-[16px] md:scroll-mt-[120px] nx-card p-[14px] md:p-[24px] flex flex-col gap-[14px] md:gap-[18px] min-w-0',
        confirmed && 'nx-slot--confirmed',
        className
      )}
    >
      <header className="flex items-start gap-[14px] md:gap-[20px] min-w-0">
        <div className="shrink-0 w-[62px] md:w-[76px] text-center border-r border-[var(--nx-line)] pr-[14px] md:pr-[20px]">
          {date ? (
            <>
              <div className="nx-label leading-none">{date.weekday}</div>
              <div className="nx-display text-[40px] md:text-[52px] mt-[6px]">{date.day}</div>
              <div className="nx-label leading-none mt-[6px]">{date.month}</div>
            </>
          ) : (
            <div className="nx-label py-[10px]">Data da definire</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[4px] nx-label">
            {date && <span className="!text-[var(--nx-text)]">Ore {date.time}</span>}
            {content?.platform && (
              <span className="inline-flex items-center gap-[5px] min-w-0">
                <img
                  src={`/icons/platforms/${content.platform}.png`}
                  alt=""
                  className="h-[14px] w-[14px] shrink-0"
                />
                <span className="truncate normal-case">{content.channel || content.platform}</span>
              </span>
            )}
            <span>{contentTypeLabel(content?.contentType)}</span>
          </div>
          <h3 id={`slot-title-${item.id}`} className="nx-heading text-[21px] md:text-[28px] break-words mt-[6px]">
            {item.title || content?.title || 'Contenuto'}
          </h3>
          {slotBadge && (
            <div className="mt-[10px]">
              <NeptiveBadge tone={slotBadge.tone === 'good' ? 'solid' : slotBadge.tone}>{slotBadge.text}</NeptiveBadge>
            </div>
          )}
        </div>
      </header>

      {mode === 'agency' && item.notes && (
        <div className="text-[13px] text-[var(--nx-text-muted)] whitespace-pre-wrap">
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
        <div className="nx-banner" data-tone="receded">
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
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] gap-[18px] lg:gap-[28px] min-w-0">
            <div
              className={clsx(
                'relative min-w-0 transition-[opacity,filter] duration-200',
                receded && 'opacity-55 grayscale-[70%]'
              )}
            >
              {selected.content ? (
                <PlatformPreviewSwitcher
                  content={selected.content as any}
                  identity={previewIdentity}
                />
              ) : (
                <div className="rounded-[var(--nx-r)] bg-[var(--nx-bg)] border border-[var(--nx-line)] min-h-[200px] flex items-center justify-center nx-label">
                  Anteprima non disponibile
                </div>
              )}
            </div>
            <div className="flex flex-col gap-[18px] min-w-0">
              <section className={clsx(receded && 'opacity-75')}>
                <SectionLabel>
                  {multiple ? `Testo · variante ${selected.label}` : 'Testo del post'}
                </SectionLabel>
                <div className="rounded-[var(--nx-r)] bg-[var(--nx-bg)] p-[12px] text-[15px] leading-[1.5] whitespace-pre-wrap break-words max-h-[320px] overflow-y-auto">
                  {selected.content?.caption || 'Nessuna caption'}
                </div>
              </section>
              <section>
                <SectionLabel>Commenti</SectionLabel>
                <Comments variant={selected} mode={mode} multiple={multiple} />
              </section>
              {mode === 'client' && (
                <>
                  <ClientComment variant={selected} multiple={multiple} onDone={onChanged} />
                  <DecisionBar variant={selected} multiple={multiple} onDone={onChanged} className="hidden lg:block" />
                </>
              )}
            </div>
          </div>
          {mode === 'client' && (
            // phones: direct child of the tab panel, so `sticky bottom-0` keeps the two
            // actions at the bottom of the screen for as long as this variant is on screen
            <DecisionBar
              variant={selected}
              multiple={multiple}
              onDone={onChanged}
              className="lg:hidden sticky bottom-0 z-[5] -mx-[14px] md:-mx-[24px] -mb-[14px] md:-mb-[24px] px-[14px] md:px-[24px] pt-[12px] pb-[calc(12px+env(safe-area-inset-bottom))] nx-sticky-bar border-t border-[var(--nx-line)]"
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
      <div className="text-[14px] text-[var(--nx-text-muted)] py-[12px]">
        Nessun contenuto in questo piano.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[16px] min-w-0">
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
