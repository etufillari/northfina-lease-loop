import type { ReturnStatus } from '@/domain/return-workflow';
import type { Translate } from '@/i18n/get-t';

const styles: Record<ReturnStatus, { badge: string; dot: string }> = {
  requested: {
    badge:
      'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800',
    dot: 'bg-sky-600 dark:bg-sky-400',
  },
  received: {
    badge:
      'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
    dot: 'bg-amber-500 dark:bg-amber-400',
  },
  inspected: {
    badge:
      'bg-violet-50 text-violet-900 ring-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800',
    dot: 'bg-violet-600 dark:bg-violet-400',
  },
  planned: {
    badge:
      'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
    dot: 'bg-emerald-600 dark:bg-emerald-400',
  },
  approved: {
    badge:
      'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
    dot: 'bg-emerald-600 dark:bg-emerald-400',
  },
  completed: {
    badge:
      'bg-stone-100 text-stone-800 ring-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-600',
    dot: 'bg-stone-500 dark:bg-stone-400',
  },
  cancelled: {
    badge:
      'bg-stone-100 text-stone-800 ring-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-600',
    dot: 'bg-stone-500 dark:bg-stone-400',
  },
};

/** The workflow status as a coloured pill. The text carries the meaning; colour only helps. */
export function ReturnStatusBadge({ status, t }: { status: ReturnStatus; t: Translate }) {
  const style = styles[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${style.badge}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
      {t(`dealer.status.${status}`)}
    </span>
  );
}
