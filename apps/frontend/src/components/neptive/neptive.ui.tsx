'use client';

import { ReactNode } from 'react';
import clsx from 'clsx';
import {
  NEPTIVE_APPROVAL_TRANSITIONS,
  NEPTIVE_PED_TRANSITIONS,
} from '@gitroom/nestjs-libraries/neptive/domain/state-machines';
import { postPreviewText } from '@gitroom/nestjs-libraries/neptive/domain/post-preview';

export const NeptiveCard = ({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={clsx(
        'bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[16px]',
        className
      )}
    >
      {title && (
        <div className="text-[14px] font-[600] mb-[12px] text-textColor">
          {title}
        </div>
      )}
      {children}
    </div>
  );
};

export const NeptiveBadge = ({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) => {
  const colors = {
    neutral: 'bg-newBtnSimple text-textColor',
    good: 'bg-green-900/40 text-green-300',
    warn: 'bg-amber-900/40 text-amber-200',
    bad: 'bg-red-900/40 text-red-300',
  };
  return (
    <span
      className={clsx(
        'inline-flex px-[8px] py-[2px] rounded-[6px] text-[11px] font-[600]',
        colors[tone]
      )}
    >
      {children}
    </span>
  );
};

export const statusTone = (status: string) => {
  if (
    ['APPROVED', 'ACTIVE', 'PUBLISHED', 'COMPLETED', 'QUEUE'].includes(status)
  ) {
    return 'good' as const;
  }
  if (
    ['CHANGES_REQUESTED', 'PENDING_CLIENT_APPROVAL', 'CLIENT_REVIEW'].includes(
      status
    )
  ) {
    return 'warn' as const;
  }
  if (['REJECTED', 'FAILED'].includes(status)) {
    return 'bad' as const;
  }
  return 'neutral' as const;
};

export const NeptiveEmpty = ({ children }: { children: ReactNode }) => (
  <div className="text-[13px] text-newTableText py-[12px]">{children}</div>
);

export const NeptiveField = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <label className="flex flex-col gap-[6px] text-[13px] text-textColor">
    <span>{label}</span>
    {children}
  </label>
);

export const fieldClass =
  'bg-newBgColor h-[42px] border border-newTableBorder rounded-[8px] px-[12px] text-[14px] text-textColor outline-none';

export const areaClass =
  'bg-newBgColor min-h-[90px] border border-newTableBorder rounded-[8px] px-[12px] py-[8px] text-[14px] text-textColor outline-none';

export { postPreviewText };

export const formatWhen = (value?: string | Date | null) => {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }
  return date.toISOString().slice(0, 16).replace('T', ' ');
};

const APPROVAL_ACTION_LABELS: Record<string, string> = {
  PENDING_INTERNAL_REVIEW: 'Submit for internal review',
  PENDING_CLIENT_APPROVAL: 'Send to client',
  APPROVED: 'Mark approved',
  CHANGES_REQUESTED: 'Request changes',
  REJECTED: 'Reject',
  DRAFT: 'Return to draft',
};

const PED_ACTION_LABELS: Record<string, string> = {
  INTERNAL_REVIEW: 'Internal review',
  CLIENT_REVIEW: 'Send to client',
  APPROVED: 'Mark approved',
  CHANGES_REQUESTED: 'Request changes',
  DRAFT: 'Back to draft',
  ACTIVE: 'Activate',
  COMPLETED: 'Complete',
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
    needsComment: false,
  }));
