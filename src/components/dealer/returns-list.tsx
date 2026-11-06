// The returns overview: one row per request, with a clear next action.
import Link from 'next/link';
import type { ReturnListItem } from '@/server/return-queries';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { ReturnStatusBadge } from './return-status-badge';

type Props = { items: ReturnListItem[]; locale: Locale; t: Translate };

export function ReturnsList({ items, locale, t }: Props) {
  if (items.length === 0) {
    return (
      <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
        {t('dealer.list.empty')}
      </p>
    );
  }

  return (
    <div className="mt-8 overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <caption className="sr-only">{t('dealer.list.caption')}</caption>
        <thead className="border-b border-stone-200 text-stone-600 dark:border-stone-800 dark:text-stone-400">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              {t('dealer.col.customer')}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t('dealer.col.asset')}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t('dealer.col.expected')}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t('dealer.col.status')}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t('dealer.col.next')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
          {items.map((item) => {
            const assetName = `${item.asset.make} ${item.asset.model}`;
            return (
              <tr key={item.id}>
                <th scope="row" className="px-4 py-3 font-medium">
                  {item.customer.name ?? t('dealer.customer.unknown')}
                  <span className="block text-xs font-normal text-stone-600 dark:text-stone-400">
                    {item.customer.id}
                  </span>
                </th>
                <td className="px-4 py-3">
                  {assetName}
                  <span className="block text-xs text-stone-600 dark:text-stone-400">
                    {item.asset.id} · {t(`category.${item.asset.category}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {item.expectedReturnDate ? (
                    <time dateTime={item.expectedReturnDate}>
                      {formatIsoDate(item.expectedReturnDate, locale)}
                    </time>
                  ) : (
                    t('dealer.expected.none')
                  )}
                </td>
                <td className="px-4 py-3">
                  <ReturnStatusBadge status={item.status} t={t} />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/${locale}/dealer/returns/${item.id}`}
                    className="font-medium text-emerald-800 underline underline-offset-2 hover:text-emerald-950 dark:text-emerald-300 dark:hover:text-emerald-100"
                  >
                    {t(`dealer.action.${item.nextAction}`)}
                    <span className="sr-only">
                      {' '}
                      ({assetName}, {item.customer.name ?? item.customer.id})
                    </span>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
