// The coloured "Available / Reserved / Returned" pill, shared by the catalogue card and the item page.
import type { AssetStatus } from '@/data/schemas';
import type { Translate } from '@/i18n/get-t';

const statusStyles: Record<AssetStatus, { badge: string; dot: string }> = {
  available: {
    badge:
      'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
    dot: 'bg-emerald-600 dark:bg-emerald-400',
  },
  reserved: {
    badge:
      'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
    dot: 'bg-amber-500 dark:bg-amber-400',
  },
  sold: {
    badge:
      'bg-stone-100 text-stone-800 ring-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-600',
    dot: 'bg-stone-500 dark:bg-stone-400',
  },
  returned: {
    badge:
      'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800',
    dot: 'bg-sky-600 dark:bg-sky-400',
  },
};

export function StatusBadge({ status, t }: { status: AssetStatus; t: Translate }) {
  const style = statusStyles[status];
  return (
    <p
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${style.badge}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
      <span className="sr-only">{t('status.label')}: </span>
      {t(`status.${status}`)}
    </p>
  );
}
