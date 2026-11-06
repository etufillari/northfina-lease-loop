import { db } from '@/server/db';
import { listLeaseInvoices } from '@/server/lease-engine/invoices';
import { getLeaseSchedule } from '@/server/lease-engine/queries';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { LeaseEngineActions } from './lease-engine-actions';

export async function LeaseEnginePanel({
  contractId,
  leaseId,
  status,
  locale,
}: {
  contractId: string;
  leaseId: string | null;
  status: string;
  locale: Locale;
}) {
  const t = getT(locale);
  const invoices = leaseId ? await listLeaseInvoices(db, leaseId) : [];
  const schedule = leaseId ? await getLeaseSchedule(db, leaseId) : null;
  const periods = schedule?.periods.slice(0, 3) ?? [];
  return (
    <section className="mt-5 border-t border-stone-200 pt-4 dark:border-stone-700">
      <h3 className="font-semibold">{t('engine.invoices')}</h3>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('engine.demoNote')}</p>
      <LeaseEngineActions
        contractId={contractId}
        leaseId={leaseId}
        status={status}
        pendingPeriods={periods
          .filter((period) => !invoices.some((invoice) => invoice.periodIndex === period.index))
          .map((period) => period.index)}
        labels={{
          activate: t('engine.activate'),
          generate: t('engine.generate'),
          complete: t('engine.complete'),
          busy: t('engine.busy'),
          error: t('engine.error'),
        }}
      />
      {schedule && (
        <p className="mt-3 text-sm">
          {t('engine.totalNet')}: {formatEuro(schedule.totalNetCents, intlLocale[locale])}
        </p>
      )}
      {invoices.length === 0 ? (
        <p className="mt-3 text-sm">{t('engine.noInvoices')}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('engine.invoices')}</caption>
            <thead>
              <tr>
                {(['number', 'issue', 'due', 'net', 'vat', 'gross'] as const).map((key) => (
                  <th key={key} className="px-2 py-2">
                    {t(`engine.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.invoiceId}
                  className="border-t border-stone-200 dark:border-stone-700"
                >
                  <td className="px-2 py-2">{invoice.number}</td>
                  <td className="px-2 py-2">{invoice.issueDate}</td>
                  <td className="px-2 py-2">{invoice.dueDate}</td>
                  <td className="px-2 py-2">{formatEuro(invoice.netCents, intlLocale[locale])}</td>
                  <td className="px-2 py-2">
                    {formatEuro(invoice.vatCents, intlLocale[locale])} ({invoice.tax.rateBps / 100}
                    %)
                  </td>
                  <td className="px-2 py-2">
                    {formatEuro(invoice.grossCents, intlLocale[locale])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {status === 'COMPLETED' && <p className="mt-4 font-medium">{t('engine.awaitingReturn')}</p>}
    </section>
  );
}
