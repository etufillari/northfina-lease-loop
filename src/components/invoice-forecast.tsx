import { loadVatRates } from '@/data/load';
import { calculateInvoice } from '@/domain/lease-engine/invoice';
import type { LeaseTerms } from '@/domain/lease-engine/types';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

/** Read-only projection from signed terms, separate from persisted issued invoices. */
export async function InvoiceForecast({
  terms,
  locale,
  terminatedOn,
}: {
  terms: LeaseTerms;
  locale: Locale;
  terminatedOn?: string | null;
}) {
  const t = getT(locale);
  const rates = (await loadVatRates()).rates;
  const rows = Array.from({ length: terms.termMonths }, (_, index) =>
    calculateInvoice(terms, index + 1, rates)
  );
  if (rows.some((row) => !row.ok)) return <p role="alert">{t('engine.error')}</p>;
  const invoices = rows
    .flatMap((row) => (row.ok ? [row.value] : []))
    .filter((row) => !terminatedOn || row.period.startDate < terminatedOn);
  return (
    <details className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <summary className="cursor-pointer underline">{t('smart.forecast')}</summary>
      <p className="my-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {t('smart.forecastNote')}
      </p>
      <p>
        {t('smart.projectedTotal')}:{' '}
        {formatEuro(
          invoices.reduce((sum, row) => sum + row.grossCents, 0),
          intlLocale[locale]
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption>{t('smart.forecast')}</caption>
          <thead>
            <tr>
              {(['issue', 'due', 'net', 'vat', 'gross'] as const).map((key) => (
                <th className="p-2" key={key}>
                  {t(`engine.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map((row, index) => (
              <tr className="border-t" key={row.period.issueDate}>
                <td className="p-2">
                  {row.period.issueDate}
                  {index > 0 && invoices[index - 1]?.tax.rateBps !== row.tax.rateBps && (
                    <strong className="block">{t('smart.taxChanged')}</strong>
                  )}
                </td>
                <td className="p-2">{row.period.dueDate}</td>
                <td className="p-2">{formatEuro(row.netCents, intlLocale[locale])}</td>
                <td className="p-2">
                  {formatEuro(row.vatCents, intlLocale[locale])} ({row.tax.rateBps / 100}%)
                </td>
                <td className="p-2">{formatEuro(row.grossCents, intlLocale[locale])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
