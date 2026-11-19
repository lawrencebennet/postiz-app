'use client';

import { ReactNode } from 'react';
import clsx from 'clsx';
import {
  NEPTIVE_APPROVAL_TRANSITIONS,
  NEPTIVE_PED_TRANSITIONS,
} from '@gitroom/nestjs-libraries/neptive/domain/state-machines';
import { postPreviewText } from '@gitroom/nestjs-libraries/neptive/domain/post-preview';

// Shared building blocks of the Neptive pages (portal, agency). Visual language: nx-* classes in
// components/neptive/brand/brand.css (Neptive Studio: flat surfaces, mono labels, square tags).

export const NeptiveCard = ({
  title,
  children,
  className,
  action,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) => {
  return (
    <section className={clsx('nx-card p-[16px] md:p-[20px] min-w-0', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-[12px] mb-[14px]">
          {title && <h2 className="nx-label !text-[var(--nx-text)]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
};

export type NeptiveTone = 'neutral' | 'good' | 'warn' | 'bad' | 'solid';

export const NeptiveBadge = ({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: NeptiveTone;
  className?: string;
}) => (
  <span className={clsx('nx-tag', className)} data-tone={tone}>
    {children}
  </span>
);

export const statusTone = (status: string) => {
  if (['APPROVED', 'ACTIVE', 'PUBLISHED', 'COMPLETED', 'QUEUE'].includes(status)) {
    return 'good' as const;
  }
  if (['CHANGES_REQUESTED', 'PENDING_CLIENT_APPROVAL', 'CLIENT_REVIEW'].includes(status)) {
    return 'warn' as const;
  }
  if (['REJECTED', 'FAILED', 'ERROR'].includes(status)) {
    return 'bad' as const;
  }
  return 'neutral' as const;
};

/** Italian label of every status the Neptive pages show (PED, approval, post, report). */
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Bozza',
  INTERNAL_REVIEW: 'Revisione interna',
  CLIENT_REVIEW: 'In revisione',
  CHANGES_REQUESTED: 'Modifiche richieste',
  APPROVED: 'Approvato',
  ACTIVE: 'Attivo',
  COMPLETED: 'Completato',
  PENDING_INTERNAL_REVIEW: 'Revisione interna',
  PENDING_CLIENT_APPROVAL: 'Da approvare',
  REJECTED: 'Rifiutato',
  NOT_SUBMITTED: 'Non inviato',
  QUEUE: 'Programmato',
  PUBLISHED: 'Pubblicato',
  ERROR: 'Errore',
  FAILED: 'Non riuscito',
  UNLINKED: 'Non collegato',
};
export const statusLabel = (status?: string | null) =>
  status ? STATUS_LABELS[status] || status.replace(/_/g, ' ').toLowerCase() : '';

const KIND_LABELS: Record<string, string> = {
  // strategy
  OBJECTIVE: 'Obiettivo',
  AUDIENCE: 'Pubblico',
  POSITIONING: 'Posizionamento',
  PILLAR: 'Pilastro',
  TONE: 'Tono di voce',
  PLATFORM: 'Piattaforma',
  PRIORITY: 'Priorità',
  EXPERIMENT: 'Esperimento',
  CAMPAIGN: 'Campagna',
  KPI: 'KPI',
  NOTE: 'Nota',
  // activities
  PROFILE_OPTIMIZATION: 'Ottimizzazione profilo',
  COMPETITOR_ANALYSIS: 'Analisi concorrenti',
  CAMPAIGN_ADJUSTMENT: 'Ottimizzazione campagne',
  MEETING: 'Riunione',
  CREATIVE_PRODUCTION: 'Produzione creativa',
  STRATEGY_UPDATE: 'Aggiornamento strategia',
  REPORT_PREPARATION: 'Preparazione report',
  WEBSITE_SOCIAL_INTERVENTION: 'Intervento sito / social',
  OTHER: 'Altro',
  POST_APPROVED: 'Post approvato',
  POST_SCHEDULED: 'Post programmato',
  POST_PUBLISHED: 'Post pubblicato',
  PED_APPROVED: 'Piano approvato',
  REPORT_GENERATED: 'Report pronto',
  // approval history
  SUBMITTED: 'Inviato',
  APPROVED_INTERNAL: 'Approvato internamente',
  APPROVED_CLIENT: 'Approvato dal cliente',
  RESUBMITTED: 'Inviato di nuovo',
  REOPENED: 'Riaperto',
  CLIENT_ADMIN: 'Amministratore',
  CLIENT_MEMBER: 'Membro',
  // materials
  BRAND_GUIDELINES: 'Linee guida del brand',
  REPORT_PDF: 'Report PDF',
  STRATEGY_DOCUMENT: 'Documento strategico',
  RAW_PHOTO: 'Foto originali',
  CLIENT_MATERIAL: 'Materiale del cliente',
  CAMPAIGN_ASSET: 'Materiale campagna',
  DELIVERABLE: 'Consegna',
  // visibility, sources
  CLIENT_VISIBLE: 'Visibile al cliente',
  INTERNAL: 'Solo interno',
  MANUAL: 'Manuale',
  SYSTEM: 'Automatico',
};
export const kindLabel = (kind?: string | null) =>
  kind ? KIND_LABELS[kind] || kind.replace(/_/g, ' ').toLowerCase() : '';

export const NeptiveEmpty = ({ children }: { children: ReactNode }) => (
  <div className="text-[14px] text-[var(--nx-text-muted)] py-[10px]">{children}</div>
);

export const NeptiveField = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-[7px] min-w-0">
    <span className="nx-label">{label}</span>
    {children}
  </label>
);

export const fieldClass = 'nx-input !h-[42px] !text-[14px]';

export const areaClass = 'nx-textarea !text-[14px]';

export { postPreviewText };

export const formatWhen = (value?: string | Date | null) => {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

/** "1 nov → 31 dic 2026" */
export const formatPeriod = (start?: string | null, end?: string | null) => {
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  const ok = (d: Date | null): d is Date => !!d && !Number.isNaN(d.getTime());
  if (!ok(s) && !ok(e)) return '';
  const short = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
  const long = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  if (ok(s) && ok(e)) return `${s.getFullYear() === e.getFullYear() ? short.format(s) : long.format(s)} → ${long.format(e)}`;
  return long.format((ok(s) ? s : e) as Date);
};

const APPROVAL_ACTION_LABELS: Record<string, string> = {
  PENDING_INTERNAL_REVIEW: 'Revisione interna',
  PENDING_CLIENT_APPROVAL: 'Invia al cliente',
  APPROVED: 'Segna come approvato',
  CHANGES_REQUESTED: 'Richiedi modifiche',
  REJECTED: 'Rifiuta',
  DRAFT: 'Torna in bozza',
};

const PED_ACTION_LABELS: Record<string, string> = {
  INTERNAL_REVIEW: 'Revisione interna',
  CLIENT_REVIEW: 'Invia al cliente',
  APPROVED: 'Segna come approvato',
  CHANGES_REQUESTED: 'Richiedi modifiche',
  DRAFT: 'Torna in bozza',
  ACTIVE: 'Attiva',
  COMPLETED: 'Chiudi',
};

export type NeptiveNextAction = {
  status: string;
  label: string;
  needsComment: boolean;
};

export const nextApprovalActions = (status: string): NeptiveNextAction[] =>
  (NEPTIVE_APPROVAL_TRANSITIONS[status] || []).map((next) => ({
    status: next,
    label: APPROVAL_ACTION_LABELS[next] || next,
    needsComment: next === 'CHANGES_REQUESTED' || next === 'REJECTED',
  }));

export const nextPedActions = (status: string): NeptiveNextAction[] =>
  (NEPTIVE_PED_TRANSITIONS[status] || []).map((next) => ({
    status: next,
    label: PED_ACTION_LABELS[next] || next,
    needsComment: next === 'CHANGES_REQUESTED',
  }));
