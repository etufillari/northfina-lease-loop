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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <p className="eyebrow">
        {assetRow ? `${assetRow.make} ${assetRow.model}` : contract.assetId}
      </p>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight uppercase sm:text-4xl">
        {t('contract.title', { id })}
      </h1>
      <p className="mt-2 text-muted">
        {t('contract.signedBy', {
          customer: customer?.name ?? contract.customerId,
          date: date(contract.signDate),
        })}
      </p>

      <section
        aria-labelledby="locked"
        className="relative mt-8 overflow-hidden rounded-xl bg-stage p-6 text-stage-fg sm:p-8"
      >
        <h2 id="locked" className="font-display text-lg font-bold tracking-tight uppercase">
          {t('contract.locked')}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-stage-muted">
          {t('contract.lockedNote', {
            date: date(contract.quoteDate),
            version: contract.priceListVersion,
          })}
        </p>
        <dl className="mt-6 grid gap-x-10 gap-y-1 text-sm sm:grid-cols-2">
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
        <h2 id="invoices" className="font-display text-lg font-bold tracking-tight uppercase">
          {t('contract.invoices')}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('contract.billingRule')}</p>
        {schedule.ok ? (
          <div className="panel mt-4 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs tracking-wide text-muted uppercase">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-semibold">{t('contract.number')}</th>
                  <th className="px-4 py-3 font-semibold">{t('contract.dueDate')}</th>
                  <th className="px-4 py-3 font-semibold">{t('contract.period')}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('contract.net')}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('contract.vatRate')}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('contract.vat')}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('contract.gross')}</th>
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
                <tr className="border-t-2 border-line bg-surface-2">
                  <td className="px-4 py-3" colSpan={3}>
                    {t('contract.total')}
                  </td>
                  <td className="px-4 py-3 text-right">{euro(schedule.totals.netCents)}</td>
                  <td />
                  <td className="px-4 py-3 text-right">{euro(schedule.totals.vatCents)}</td>
                  <td className="px-4 py-3 text-right">{euro(schedule.totals.grossCents)}</td>
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
          <td colSpan={7} className="bg-warn-bg px-4 py-2 text-warn-fg">
            {vatNote}
          </td>
        </tr>
      ) : null}
      <tr className="border-b border-line last:border-b-0 hover:bg-surface-2">
        {cells.map((cell, i) => (
          <td key={i} className={`px-4 py-2.5 whitespace-nowrap ${i >= 3 ? 'text-right' : ''}`}>
            {cell}
          </td>
        ))}
      </tr>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/10 py-2">
      <dt className="text-stage-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  );
}
