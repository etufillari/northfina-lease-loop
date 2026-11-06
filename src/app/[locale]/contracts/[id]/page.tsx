// A signed contract: the locked price, where it came from, and every invoice.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { EarlyExitPanel } from '@/components/early-exit-panel';
import { EndOfTermSection } from '@/components/end-of-term-section';
import { loadResidualCurves, loadVatRates } from '@/data/load';
import { assetConditionSchema, usageUnitSchema } from '@/data/schemas';
import { exitMonthOn } from '@/domain/early-exit';
import { billedBefore, invoiceSchedule } from '@/domain/invoicing';
import { formatEuro } from '@/domain/money';
import { formatFactor, formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getContractEnding } from '@/server/contract-endings';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';
import { earlyExitContext } from '@/server/early-exit';
import { loadLeaseDataPack } from '@/server/lease-data';
import { asOfDate } from '@/server/as-of';

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

  const [data, vatRates, curves, assetRow, ending] = await Promise.all([
    loadLeaseDataPack(),
    loadVatRates(),
    loadResidualCurves(),
    db.asset.findUnique({ where: { id: contract.assetId } }),
    getContractEnding(db, found.id),
  ]);
  const customer = data.customers.find((c) => c.id === contract.customerId);
  const fullSchedule = invoiceSchedule(contract, vatRates);
  // After an ending, only the invoices issued before it took effect (D-033).
  const schedule = fullSchedule.ok
    ? { ok: true as const, ...billedBefore(fullSchedule, ending?.effectiveDate ?? null) }
    : fullSchedule;
  const today = await asOfDate();
  // Leaving early is offered until the lease ends, unless it has already been ended (D-033).
  const exitContext =
    assetRow && !ending
      ? earlyExitContext(
          { vatRates, curves, coefficientTable: data.coefficientTable },
          contract,
          assetRow
        )
      : null;
  const exitMonth = exitMonthOn(contract, today);
  const canLeaveEarly = exitContext !== null && (exitMonth.ok || exitMonth.reason !== 'term_over');
  // The headline: the next invoice still to come, or (once ended or all billed) the total.
  const next = schedule.ok ? schedule.invoices.find((i) => i.invoiceDate >= today) : undefined;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <p className="eyebrow">
        {assetRow ? `${assetRow.make} ${assetRow.model}` : contract.assetId}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight uppercase sm:text-4xl">
          {t('contract.title', { id })}
        </h1>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${ending ? 'text-muted ring-line' : 'bg-accent/10 text-accent-text ring-accent/40'}`}
        >
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${ending ? 'bg-muted' : 'bg-accent'}`}
          />
          {t(ending ? 'contract.ended' : 'contract.active')}
        </span>
      </div>
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
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div className="max-w-2xl">
            <h2 id="locked" className="font-display text-lg font-bold tracking-tight uppercase">
              {t('contract.locked')}
            </h2>
            <p className="mt-1 text-sm text-stage-muted">
              {t('contract.lockedNote', {
                date: date(contract.quoteDate),
                version: contract.priceListVersion,
              })}
            </p>
          </div>
          {schedule.ok ? (
            <div className="text-left sm:text-right">
              <p className="text-xs font-semibold tracking-[0.08em] text-stage-muted uppercase">
                {t(next && !ending ? 'lease.monthly' : 'contract.paidInTotal')}
              </p>
              <p className="font-display text-4xl font-extrabold tracking-tight text-stage-accent tabular-nums">
                {euro(next && !ending ? next.grossCents : schedule.totals.grossCents)}
              </p>
              {next && !ending ? (
                <p className="text-sm text-stage-muted">
                  {t('contract.nextInvoice', { date: date(next.invoiceDate) })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
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
        {schedule.ok && ending && schedule.cancelledCount > 0 ? (
          <p className="mt-2 max-w-2xl text-sm font-semibold">
            {t('contract.invoicesCancelled', {
              count: String(schedule.cancelledCount),
              date: date(ending.effectiveDate),
            })}
          </p>
        ) : null}
        {schedule.ok ? (
          // A scroll box, so a 48-month schedule doesn't push the endings off the page; the
          // header stays put while the rows scroll.
          <div className="panel mt-4 max-h-[32rem] overflow-auto overscroll-contain">
            <table className="w-full text-sm tabular-nums">
              <thead className="sticky top-0 z-10 bg-surface text-left text-xs tracking-wide text-muted uppercase">
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
                {schedule.downPayment ? (
                  // Invoice 0: the down payment is part of the total cost, so it is billed too.
                  <InvoiceRows
                    vatNote={null}
                    cells={[
                      String(schedule.downPayment.number),
                      date(schedule.downPayment.invoiceDate),
                      t('contract.downPaymentInvoice'),
                      euro(schedule.downPayment.netCents),
                      formatNumber(schedule.downPayment.vatRatePercent, locale),
                      euro(schedule.downPayment.vatCents),
                      euro(schedule.downPayment.grossCents),
                    ]}
                  />
                ) : null}
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
              <tfoot className="sticky bottom-0 font-semibold">
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

      {canLeaveEarly && exitContext && assetRow ? (
        <section aria-labelledby="early-exit" className="mt-10">
          <h2 id="early-exit" className="font-display text-lg font-bold tracking-tight uppercase">
            {t('early.title')}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {t('early.intro', { rate: formatNumber(exitContext.annualInterestPercent, locale) })}
          </p>
          {/* Keyed by the demo date, so moving it starts the slider on the new current month. */}
          <EarlyExitPanel
            key={today}
            locale={locale}
            contractId={found.id}
            contract={contract}
            context={exitContext}
            unit={usageUnitSchema.parse(assetRow.usage_unit)}
            today={today}
          />
        </section>
      ) : null}

      <EndOfTermSection
        locale={locale}
        contractId={found.id}
        assetId={contract.assetId}
        contract={contract}
        ending={ending}
        vatRates={vatRates}
        today={today}
        asset={
          assetRow
            ? {
                condition: assetConditionSchema.parse(assetRow.condition),
                usageValue: assetRow.usage_value,
                unit: usageUnitSchema.parse(assetRow.usage_unit),
              }
            : null
        }
        customers={data.customers}
      />
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
