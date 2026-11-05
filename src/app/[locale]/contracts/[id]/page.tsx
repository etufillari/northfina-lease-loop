// A signed contract: the locked price, where it came from, and every invoice.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { loadVatRates } from '@/data/load';
import { invoiceSchedule } from '@/domain/invoicing';
import { formatEuro } from '@/domain/money';
import { formatFactor, formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';
import { loadLeaseDataPack } from '@/server/lease-data';

export default async function ContractPage({ params }: PageProps<'/[locale]/contracts/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^\d+$/.test(id)) notFound();
  await connection();

  const found = await getContract(db, Number(id));
  if (!found) notFound();
  const { contract } = found;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const date = (iso: string) => formatIsoDate(iso, locale);

  const [data, vatRates, assetRow] = await Promise.all([
    loadLeaseDataPack(),
    loadVatRates(),
    db.asset.findUnique({ where: { id: contract.assetId } }),
  ]);
  const customer = data.customers.find((c) => c.id === contract.customerId);
  const schedule = invoiceSchedule(contract, vatRates);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        {assetRow ? `${assetRow.make} ${assetRow.model}` : contract.assetId}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">{t('contract.title', { id })}</h1>
      <p className="mt-2 text-stone-700 dark:text-stone-300">
        {t('contract.signedBy', {
          customer: customer?.name ?? contract.customerId,
          date: date(contract.signDate),
        })}
      </p>

      <section
        aria-labelledby="locked"
        className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
      >
        <h2 id="locked" className="text-lg font-semibold">
          {t('contract.locked')}
        </h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {t('contract.lockedNote', {
            date: date(contract.quoteDate),
            version: contract.priceListVersion,
          })}
        </p>
        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Fact label={t('lease.listPrice', { version: contract.priceListVersion })}>
            {euro(contract.listPriceCents)}
          </Fact>
          <Fact label={t('lease.minusDown')}>{euro(contract.downPaymentCents)}</Fact>
          <Fact label={t('lease.financed')}>{euro(contract.financedCents)}</Fact>
          <Fact label={t('lease.factor', { band: contract.band })}>
            {formatFactor(contract.factor, locale)}
          </Fact>
          <Fact label={t('lease.net')}>{euro(contract.monthlyNetRentCents)}</Fact>
          <Fact label={t('lease.term')}>{t('lease.months', { count: contract.termMonths })}</Fact>
          <Fact label={t('lease.buyout')}>{euro(contract.buyoutCents)}</Fact>
          <Fact label={t('lease.totalCost')}>{euro(contract.totalNetCostCents)}</Fact>
        </dl>
      </section>

      <section aria-labelledby="invoices" className="mt-10">
        <h2 id="invoices" className="text-lg font-semibold">
          {t('contract.invoices')}
        </h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {t('contract.billingRule')}
        </p>
        {schedule.ok ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-stone-600 dark:text-stone-400">
                <tr className="border-b border-stone-200 dark:border-stone-800">
                  <th className="py-2 pr-4 font-medium">{t('contract.number')}</th>
                  <th className="py-2 pr-4 font-medium">{t('contract.dueDate')}</th>
                  <th className="py-2 pr-4 font-medium">{t('contract.period')}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t('contract.net')}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t('contract.vatRate')}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t('contract.vat')}</th>
                  <th className="py-2 text-right font-medium">{t('contract.gross')}</th>
                </tr>
              </thead>
              <tbody>
                {schedule.invoices.map((invoice, i) => {
                  const previous = schedule.invoices[i - 1];
                  const vatChanged =
                    previous !== undefined && previous.vatRatePercent !== invoice.vatRatePercent;
                  return (
                    <InvoiceRows
                      key={invoice.number}
                      vatNote={
                        vatChanged
                          ? t('contract.vatChanged', {
                              date: date(invoice.invoiceDate),
                              rate: formatNumber(invoice.vatRatePercent, locale),
                            })
                          : null
                      }
                      cells={[
                        String(invoice.number),
                        date(invoice.invoiceDate),
                        `${date(invoice.periodStart)} – ${date(invoice.periodEnd)}`,
                        euro(invoice.netCents),
                        formatNumber(invoice.vatRatePercent, locale),
                        euro(invoice.vatCents),
                        euro(invoice.grossCents),
                      ]}
                    />
                  );
                })}
              </tbody>
              <tfoot className="font-semibold">
                <tr className="border-t-2 border-stone-300 dark:border-stone-700">
                  <td className="py-2 pr-4" colSpan={3}>
                    {t('contract.total')}
                  </td>
                  <td className="py-2 pr-4 text-right">{euro(schedule.totals.netCents)}</td>
                  <td />
                  <td className="py-2 pr-4 text-right">{euro(schedule.totals.vatCents)}</td>
                  <td className="py-2 text-right">{euro(schedule.totals.grossCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function InvoiceRows({ cells, vatNote }: { cells: string[]; vatNote: string | null }) {
  return (
    <>
      {vatNote ? (
        <tr>
          <td
            colSpan={7}
            className="bg-amber-50 px-3 py-2 text-amber-950 dark:bg-amber-950 dark:text-amber-100"
          >
            {vatNote}
          </td>
        </tr>
      ) : null}
      <tr className="border-b border-stone-100 dark:border-stone-800">
        {cells.map((cell, i) => (
          <td key={i} className={`py-2 pr-4 ${i >= 3 ? 'text-right' : ''}`}>
            {cell}
          </td>
        ))}
      </tr>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-stone-100 py-1.5 dark:border-stone-800">
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}
