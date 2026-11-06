// A contract's invoices as a table: sequence, period, due day, net, VAT rate, VAT, gross and
// the status on `today`, with one line explaining a VAT rate change between rows (D2), and a
// "Pay" button on every unpaid invoice, upcoming ones included (paying early is an advance
// payment, src/server/invoices.ts). A server component: the contract page passes the
// contract id, the request's day and the language; only a viewer the page let in (the
// contract's customer or admin, D73) sees the table, the same people the pay route allows.
import { loadVatRates } from '@/data/load';
import { firstVatChange, invoiceStatusOn, scheduleTotals } from '@/domain/invoicing';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { db } from '@/server/db';
import { listInvoices } from '@/server/invoices';
import { PayInvoiceButton } from './pay-invoice-button';
import { Badge, DateText, Money, Notice } from './ui';

type InvoiceTableProps = {
  contractId: string;
  /** The request's day (the demo clock), read once by the page. */
  today: string;
  locale: Locale;
  t: Translate;
};

const statusBadge = {
  paid: 'paid',
  due: 'due',
  overdue: 'overdue',
  upcoming: 'issued',
  cancelled: 'cancelled',
} as const;

const percent = (basisPoints: number, locale: Locale) => formatNumber(basisPoints / 100, locale);

const cell = 'px-3 py-2 whitespace-nowrap';
const number = `${cell} text-right tabular-nums`;

export async function InvoiceTable({ contractId, today, locale, t }: InvoiceTableProps) {
  const [invoices, vatRates] = await Promise.all([listInvoices(db, contractId), loadVatRates()]);
  if (invoices.length === 0) return <p className="text-sm text-ink-muted">{t('invoice.empty')}</p>;

  const change = firstVatChange(invoices, vatRates);
  const rent = invoices.find((invoice) => invoice.kind === 'rent');
  // A rent an early exit cancelled is shown, but owes nothing (docs/features/exits.md).
  const totals = scheduleTotals(invoices.filter((invoice) => invoice.status !== 'cancelled'));

  return (
    <div className="space-y-3">
      {change && rent ? (
        <Notice tone="info">
          {t('invoice.vatChange', {
            net: formatEuro(rent.netCents, intlLocale[locale]),
            oldRate: percent(change.oldRateBasisPoints, locale),
            lastOldDay: formatIsoDate(change.lastOldDay, locale),
            newRate: percent(change.newRateBasisPoints, locale),
            firstNewDay: formatIsoDate(change.firstNewDay, locale),
          })}
        </Notice>
      ) : null}
      <div className="relative overflow-x-auto rounded-lg ring-1 ring-line">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('invoice.caption')}</caption>
          <thead className="bg-raised text-left text-xs text-ink-muted">
            <tr>
              <th scope="col" className={cell}>
                {t('invoice.col.sequence')}
              </th>
              <th scope="col" className={cell}>
                {t('invoice.col.period')}
              </th>
              <th scope="col" className={cell}>
                {t('invoice.col.due')}
              </th>
              <th scope="col" className={number}>
                {t('invoice.col.net')}
              </th>
              <th scope="col" className={number}>
                {t('invoice.col.vatRate')}
              </th>
              <th scope="col" className={number}>
                {t('invoice.col.vat')}
              </th>
              <th scope="col" className={number}>
                {t('invoice.col.gross')}
              </th>
              <th scope="col" className={cell}>
                {t('invoice.col.status')}
              </th>
              <th scope="col" className={cell}>
                <span className="sr-only">{t('invoice.col.action')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {invoices.map((invoice) => {
              const status =
                invoice.status === 'cancelled' ? 'cancelled' : invoiceStatusOn(invoice, today);
              return (
                <tr key={invoice.id}>
                  <th scope="row" className={`${cell} font-medium`}>
                    {invoice.sequence}
                  </th>
                  <td className={cell}>
                    {invoice.periodStart && invoice.periodEnd
                      ? t('invoice.periodRange', {
                          start: formatIsoDate(invoice.periodStart, locale),
                          end: formatIsoDate(invoice.periodEnd, locale),
                        })
                      : t(`invoice.kind.${invoice.kind}`)}
                  </td>
                  <td className={cell}>
                    <DateText iso={invoice.dueDate} locale={locale} />
                  </td>
                  <td className={number}>
                    <Money cents={invoice.netCents} locale={locale} />
                  </td>
                  <td className={number}>
                    {t('invoice.vatRatePercent', {
                      rate: percent(invoice.vatRateBasisPoints, locale),
                    })}
                  </td>
                  <td className={number}>
                    <Money cents={invoice.vatCents} locale={locale} />
                  </td>
                  <td className={`${number} font-medium`}>
                    <Money cents={invoice.grossCents} locale={locale} />
                  </td>
                  <td className={cell}>
                    <Badge status={statusBadge[status]} srPrefix={t('invoice.col.status')}>
                      {t(`invoice.status.${status}`)}
                    </Badge>
                  </td>
                  <td className={cell}>
                    {status === 'paid' || status === 'cancelled' ? null : (
                      <PayInvoiceButton
                        invoiceId={invoice.id}
                        sequence={invoice.sequence}
                        locale={locale}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="font-medium">
            <tr>
              <th scope="row" colSpan={3} className={cell}>
                {t('invoice.total')}
              </th>
              <td className={number}>
                <Money cents={totals.netCents} locale={locale} />
              </td>
              <td className={cell} />
              <td className={number}>
                <Money cents={totals.vatCents} locale={locale} />
              </td>
              <td className={number}>
                <Money cents={totals.grossCents} locale={locale} />
              </td>
              <td className={cell} />
              <td className={cell} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
