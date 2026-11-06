// The invoices of a contract: those issued by today, the next one, and the whole schedule.
// When the VAT rate changes, it says so in plain words: the locked rent stays the same and
// only the VAT part (and so the total) moves.
import Link from 'next/link';
import type { InvoiceWithStatus } from '@/domain/invoicing';
import { splitByDate, sumInvoices, upcomingVatChange } from '@/domain/invoicing';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type InvoiceListProps = {
  invoices: InvoiceWithStatus[];
  contractId: string;
  today: string;
  locale: Locale;
  t: Translate;
};

export function InvoiceList({ invoices, contractId, today, locale, t }: InvoiceListProps) {
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const { issued, upcoming } = splitByDate(invoices, today);
  const next = upcoming[0];
  const issuedTotals = sumInvoices(issued);
  const allTotals = sumInvoices(invoices);
  // Warn about a VAT change only while it is still ahead; once it has happened, each row
  // still shows its own VAT %.
  const change = upcomingVatChange(invoices, today);
  const vatChange = change?.invoice;
  const beforeChange = change?.previous;

  return (
    <section
      aria-labelledby="invoices-heading"
      className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 print:hidden"
    >
      <h2 id="invoices-heading" className="text-lg font-semibold">
        {t('invoices.title')}
      </h2>

      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <Fact
          label={t('invoices.issuedCount')}
          value={t('invoices.ofTotal', { count: issued.length, total: invoices.length })}
        />
        <Fact label={t('invoices.paidSoFar')} value={euro(issuedTotals.totalCents)} />
        <Fact
          label={t('invoices.next')}
          value={
            next
              ? t('invoices.nextValue', {
                  date: formatIsoDate(next.dueDate, locale),
                  amount: euro(next.totalCents),
                })
              : t('invoices.none')
          }
        />
      </dl>

      {vatChange && beforeChange ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {t('invoices.vatChange', {
            number: vatChange.number,
            date: formatIsoDate(vatChange.dueDate, locale),
            from: formatNumber(beforeChange.vatPercent, locale),
            to: formatNumber(vatChange.vatPercent, locale),
            net: euro(vatChange.netCents),
            before: euro(beforeChange.totalCents),
            after: euro(vatChange.totalCents),
          })}
        </p>
      ) : null}

      <details className="mt-4" open={invoices.length <= 12}>
        <summary className="cursor-pointer text-sm font-medium text-emerald-800 dark:text-emerald-300">
          {t('invoices.showAll', { count: invoices.length })}
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm tabular-nums">
            <thead className="text-left text-stone-600 dark:text-stone-400">
              <tr className="border-b border-stone-200 dark:border-stone-700">
                <th scope="col" className="py-2 pr-3 font-medium">
                  #
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('invoices.due')}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t('invoices.net')}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t('invoices.vat')}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t('invoices.total')}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t('invoices.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const isIssued = invoice.status !== 'upcoming';
                const href = `/${locale}/contracts/${contractId}/invoices/${invoice.number}`;
                return (
                  <tr
                    key={invoice.number}
                    className={
                      'border-b border-stone-100 dark:border-stone-800 ' +
                      (invoice === vatChange ? 'bg-amber-50 dark:bg-amber-950/50 ' : '') +
                      (isIssued ? '' : 'text-stone-500 dark:text-stone-500')
                    }
                  >
                    <td className="py-1.5 pr-3">
                      {isIssued ? (
                        <Link
                          href={href}
                          className="font-medium text-emerald-800 underline underline-offset-2 dark:text-emerald-300"
                        >
                          {invoice.number}
                        </Link>
                      ) : (
                        invoice.number
                      )}
                    </td>
                    <td className="py-1.5 pr-3">{formatIsoDate(invoice.dueDate, locale)}</td>
                    <td className="py-1.5 pr-3 text-right">{euro(invoice.netCents)}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {euro(invoice.vatCents)}{' '}
                      <span className="text-xs text-stone-500">
                        ({formatNumber(invoice.vatPercent, locale)} %)
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right font-medium">
                      {euro(invoice.totalCents)}
                    </td>
                    <td className="py-1.5">
                      {invoice.paidAtSigning
                        ? t('invoices.state.paidAtSigning')
                        : t(`invoices.state.${invoice.status}`)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <th scope="row" colSpan={2} className="py-2 pr-3 text-left">
                  {t('invoices.sum')}
                </th>
                <td className="py-2 pr-3 text-right">{euro(allTotals.netCents)}</td>
                <td className="py-2 pr-3 text-right">{euro(allTotals.vatCents)}</td>
                <td className="py-2 pr-3 text-right">{euro(allTotals.totalCents)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">{t('invoices.rules')}</p>
      </details>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
