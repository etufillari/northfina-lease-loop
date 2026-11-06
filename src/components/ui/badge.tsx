// A status pill. `status` picks the colour from the palette (docs/decisions.md D21);
// the caller passes the translated label as children.
import type { ReactNode } from 'react';
import { cx } from './cx';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** Every status the app shows, across assets, applications, contracts and invoices. */
export const statusTone = {
  // assets
  available: 'success',
  reserved: 'info',
  returned: 'neutral',
  leased: 'neutral',
  sold: 'neutral',
  refurbishing: 'warning',
  // applications
  draft: 'neutral',
  submitted: 'info',
  approved: 'success',
  rejected: 'danger',
  manual_review: 'warning',
  awaiting_signatory: 'warning',
  withdrawn: 'neutral',
  // quotes and contracts
  quoted: 'info',
  expired: 'neutral',
  signed: 'success',
  active: 'success',
  bought: 'success',
  passed_on: 'info',
  ended_early: 'warning',
  ended: 'neutral',
  bought_out: 'success',
  terminated: 'danger',
  // invoices
  issued: 'info',
  due: 'warning',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'neutral',
} as const satisfies Record<string, Tone>;

export type BadgeStatus = keyof typeof statusTone;

const tones: Record<Tone, { pill: string; dot: string }> = {
  success: { pill: 'bg-success-soft text-success-ink ring-success-line', dot: 'bg-success-solid' },
  warning: { pill: 'bg-warning-soft text-warning-ink ring-warning-line', dot: 'bg-warning-solid' },
  danger: { pill: 'bg-danger-soft text-danger-ink ring-danger-line', dot: 'bg-danger-solid' },
  info: { pill: 'bg-info-soft text-info-ink ring-info-line', dot: 'bg-info-solid' },
  neutral: { pill: 'bg-neutral-soft text-neutral-ink ring-neutral-line', dot: 'bg-neutral-solid' },
};

type BadgeProps = {
  /** Picks the colour. Leave it out and pass `tone` for a badge that is not a status. */
  status?: BadgeStatus;
  tone?: Tone;
  /** Read before the label by screen readers only, e.g. "Status". */
  srPrefix?: string;
  className?: string;
  children: ReactNode;
};

export function Badge({ status, tone, srPrefix, className, children }: BadgeProps) {
  const style = tones[tone ?? (status ? statusTone[status] : 'neutral')];
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        style.pill,
        className
      )}
    >
      <span aria-hidden="true" className={cx('size-1.5 rounded-full', style.dot)} />
      {srPrefix ? <span className="sr-only">{srPrefix}: </span> : null}
      {children}
    </span>
  );
}
