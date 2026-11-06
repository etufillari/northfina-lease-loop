// The leases ending in the chosen range, soonest first. Every row is labelled as a forecast:
// the date is when the lease ends, not a confirmed return.
import Link from 'next/link';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { LeaseForecastItem } from '@/server/lease-forecast';
import { ReturnStatusBadge } from './return-status-badge';
import { isReturnStatus } from '@/domain/return-workflow';

type Props = { entries: LeaseForecastItem[]; locale: Locale; t: Translate };

const phaseStyle = {
  overdue:
    'bg-red-50 text-red-900 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-800',
  soon: 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
  upcoming:
    'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800',
} as const;

function daysText(entry: LeaseForecastItem, t: Translate): string {
  const days = entry.daysUntilEnd;
  if (days < 0) return t('dealer.forecast.days.overdue', { count: -days });
  if (days === 0) return t('dealer.forecast.days.today');
  if (days === 1) return t('dealer.forecast.days.tomorrow');
  return t('dealer.forecast.days.future', { count: days });
}

export function ForecastTable({ entries, locale, t }: Props) {
  if (entries.length === 0) {
    return (
      <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
        {t('dealer.forecast.empty')}
      </p>
    );
  }

  return (
    <div className="mt-8 overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <table className="w-full min-w-[48rem] text-left text-sm">
        <caption className="sr-only">{t('dealer.forecast.caption')}</caption>
        <thead className="border-b border-stone-200 text-stone-600 dark:border-stone-800 dark:text-stone-400">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              {t('dealer.col.asset')}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t('dealer.col.customer')}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t('dealer.forecast.col.leaseEnds')}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t('dealer.col.status')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
          {entries.map((entry) => (
            <tr key={entry.contractId}>
              <th scope="row" className="px-4 py-3 font-medium">
                {entry.asset.make} {entry.asset.model}
                <span className="block text-xs font-normal text-stone-600 dark:text-stone-400">
                  {entry.asset.id} · {t(`category.${entry.asset.category}`)}
                </span>
              </th>
              <td className="px-4 py-3">
                {entry.customerName ?? t('dealer.customer.unknown')}
                <span className="block text-xs text-stone-600 dark:text-stone-400">
                  {entry.customerId}
                </span>
              </td>
              <td className="px-4 py-3">
                <time dateTime={entry.endDate}>{formatIsoDate(entry.endDate, locale)}</time>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${phaseStyle[entry.phase]}`}
                >
                  {daysText(entry, t)}
                </span>
              </td>
              <td className="px-4 py-3">
                {entry.openReturn && isReturnStatus(entry.openReturn.status) ? (
                  <div className="flex flex-col items-start gap-1">
                    <ReturnStatusBadge status={entry.openReturn.status} t={t} />
                    <Link
                      href={`/${locale}/dealer/returns/${entry.openReturn.id}`}
                      className="font-medium text-emerald-800 underline underline-offset-2 hover:text-emerald-950 dark:text-emerald-300 dark:hover:text-emerald-100"
                    >
                      {t('dealer.forecast.openReturn')}
                      <span className="sr-only">
                        {' '}
                        ({entry.asset.make} {entry.asset.model})
                      </span>
                    </Link>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-800 ring-1 ring-stone-300 ring-inset dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-600">
                    {t('dealer.forecast.noReturnYet')}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
