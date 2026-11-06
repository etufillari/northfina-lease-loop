// Admin: the tally of sold items. A bought item belongs to its lessee and has left the loop, so
// the catalogue doesn't show it; this is where staff see how many were sold, what the buyouts
// brought in, and which items went to whom (see src/domain/sold.ts).
import Link from 'next/link';
import { contractNumber } from '@/domain/contract';
import { formatEuro } from '@/domain/money';
import type { Sale } from '@/domain/sold';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type SoldItemsPanelProps = {
  sold: { count: number; paidCents: number; sales: (Sale & { assetName: string })[] };
  locale: Locale;
  t: Translate;
};

export function SoldItemsPanel({ sold, locale, t }: SoldItemsPanelProps) {
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);

  return (
    <section
      aria-labelledby="sold-heading"
      className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 id="sold-heading" className="mb-4 text-lg font-semibold">
        {t('admin.sold.title')}
      </h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-stone-600 dark:text-stone-400">{t('admin.sold.count')}</dt>
          <dd className="text-2xl font-semibold tabular-nums">{sold.count}</dd>
        </div>
        <div>
          <dt className="text-sm text-stone-600 dark:text-stone-400">{t('admin.sold.paid')}</dt>
          <dd className="text-2xl font-semibold tabular-nums">{euro(sold.paidCents)}</dd>
        </div>
      </dl>

      {sold.sales.length === 0 ? (
        <p className="mt-4 text-stone-700 dark:text-stone-300">{t('admin.sold.none')}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-stone-600 dark:text-stone-400">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t('admin.sold.item')}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t('admin.sold.buyer')}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t('admin.sold.date')}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t('admin.sold.how')}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t('admin.sold.price')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {sold.sales.map((sale) => (
                <tr key={sale.contractId}>
                  <td className="py-2 pr-4">
                    <Link
                      href={`/${locale}/assets/${sale.assetId}`}
                      className="font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-300"
                    >
                      {sale.assetName}
                    </Link>
                    <span className="block font-mono text-xs text-stone-600 dark:text-stone-400">
                      {sale.assetId} ·{' '}
                      <Link href={`/${locale}/contracts/${sale.contractId}`} className="underline">
                        {contractNumber(sale.contractId)}
                      </Link>
                    </span>
                  </td>
                  <td className="py-2 pr-4">{sale.customerName}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <time dateTime={sale.date}>{formatIsoDate(sale.date, locale)}</time>
                  </td>
                  <td className="py-2 pr-4">
                    {sale.early ? t('admin.sold.early') : t('admin.sold.endOfTerm')}
                  </td>
                  <td className="py-2 text-right tabular-nums">{euro(sale.paidCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">{t('admin.sold.note')}</p>
    </section>
  );
}
