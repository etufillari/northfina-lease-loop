import Link from 'next/link';
import { ReturnRequest } from './return-request';
import { usageUnitSchema } from '@/data/schemas';
import { DemoLeaseCompletion } from './demo-lease-completion';
import { toLeaseDTO } from '@/server/lease-engine/contracts';
import { InvoiceForecast } from './invoice-forecast';
import { EndOptionActions } from './end-option-actions';
import { totalNetIfBought } from '@/domain/circular/money';
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
  operator = false,
}: {
  contractId: string;
  leaseId: string | null;
  status: string;
  locale: Locale;
  operator?: boolean;
}) {
  const t = getT(locale);
  const invoices = leaseId ? await listLeaseInvoices(db, leaseId) : [];
  const schedule = leaseId ? await getLeaseSchedule(db, leaseId) : null;
  const settlement = leaseId ? await db.leaseSettlement.findUnique({ where: { leaseId } }) : null;
  const receipt = leaseId ? await db.assetReturn.findUnique({ where: { leaseId } }) : null;
  const contract = await db.contract.findUnique({ where: { id: contractId } });
  const state = leaseId ? await db.engineLease.findUnique({ where: { id: leaseId } }) : null;
  const returnAsset =
    !operator && state ? await db.asset.findUnique({ where: { id: state.assetId } }) : null;
  const returnUsageUnit = returnAsset ? usageUnitSchema.parse(returnAsset.usage_unit) : null;
  const periods = (schedule?.periods ?? [])
    .filter((period) => !state?.terminatedOn || period.startDate < state.terminatedOn)
    .filter((period) => !invoices.some((invoice) => invoice.periodIndex === period.index))
    .slice(0, 3);
  return (
    <section className="lease-panel mt-6 border-t border-stone-200 pt-6 dark:border-stone-700">
      {!operator && leaseId && (
        <section
          aria-labelledby={`next-${leaseId}`}
          aria-live="polite"
          className="mb-6 space-y-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-stone-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-stone-100"
        >
          <h3 id={`next-${leaseId}`} tabIndex={-1} className="text-xl font-semibold">
            {t(
              settlement || receipt
                ? 'journey.saved'
                : status === 'COMPLETED'
                  ? 'journey.completed'
                  : 'journey.active'
            )}
          </h3>
          <p>
            {t(
              settlement || receipt
                ? 'journey.savedHelp'
                : status === 'COMPLETED'
                  ? 'journey.completedHelp'
                  : 'journey.activeHelp'
            )}
          </p>
          {!operator && leaseId && !settlement && !receipt && (
            <EndOptionActions
              leaseId={leaseId}
              status={status}
              locale={locale}
              labels={{
                return: t('end.return'),
                pass: t('end.pass'),
                buy: t('end.buy'),
                early: t('end.early'),
                returnHelp: t('journey.returnHelp'),
                passHelp: t('journey.passHelp'),
                buyHelp: t('journey.buyHelp'),
                earlyHelp: t('journey.earlyHelp'),
                busy: t('engine.busy'),
                error: t('engine.error'),
              }}
            />
          )}
          {settlement && (
            <p className="mt-3">
              {t('end.recorded')}: {settlement.option} ·{' '}
              {formatEuro(settlement.grossCents, intlLocale[locale])} · {settlement.effectiveOn}
            </p>
          )}
          {settlement && ['RETURN', 'PASS_ON', 'EARLY_RETURN'].includes(settlement.option) && (
            <p>
              {t(
                receipt?.status === 'READY'
                  ? 'journey.returnDone'
                  : receipt
                    ? 'journey.companyHandling'
                    : 'operator.returnInstructions'
              )}
            </p>
          )}
          {returnAsset &&
            leaseId &&
            ['COMPLETED', 'TERMINATED'].includes(status) &&
            settlement?.option !== 'BUYOUT' &&
            (settlement || receipt) && (
              <ReturnRequest
                leaseId={leaseId}
                usageValue={receipt?.usageValue ?? returnAsset.usage_value}
                usageUnit={returnAsset.usage_unit}
                status={receipt?.status ?? null}
                labels={{
                  title: t('return.title'),
                  usage: t('return.usage'),
                  submit: t('return.submit'),
                  pending: t('return.pending'),
                  processing: t('return.processing'),
                  ready: t('return.ready'),
                  rejected: t('return.rejected'),
                  error: t('return.error'),
                  busy: t('return.busy'),
                  unit: returnUsageUnit ? t(`usage.unit.${returnUsageUnit}`) : '',
                }}
              />
            )}
          {settlement?.option === 'BUYOUT' && <p>{t('journey.buyoutNext')}</p>}
        </section>
      )}
      {!operator && leaseId && status === 'ACTIVE' && process.env.NODE_ENV === 'development' && (
        <DemoLeaseCompletion
          leaseId={leaseId}
          labels={{
            button: t('journey.demo'),
            help: t('journey.demoHelp'),
            confirm: t('journey.demoConfirm'),
            cancel: t('journey.cancel'),
            busy: t('engine.busy'),
            error: t('engine.error'),
          }}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{t('engine.costDetails')}</h3>
        {!operator && (
          <Link className="ui-secondary text-sm" href={`/${locale}/invoices`}>
            {t('invoices.title')}
          </Link>
        )}
      </div>
      {operator && (
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {t('engine.demoNote')}
        </p>
      )}
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {t('smart.taxExplanation')}
      </p>
      {operator && (
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
      )}
      {state && (
        <InvoiceForecast
          terms={toLeaseDTO(state)}
          locale={locale}
          terminatedOn={state.terminatedOn}
        />
      )}
      {schedule && (
        <p className="mt-3 text-sm">
          {t('engine.totalNet')}: {formatEuro(schedule.totalNetCents, intlLocale[locale])}
        </p>
      )}
      {contract && contract.financed_cents > 0 && (
        <div className="mt-3 text-sm">
          <p>
            {t('end.down')}: {formatEuro(contract.down_payment_cents, intlLocale[locale])}
          </p>
          <p>
            {t('end.buyoutNet')}: {formatEuro(contract.buyout_net_cents, intlLocale[locale])}
          </p>
          <p>
            {t('end.totalNet')}:{' '}
            {formatEuro(
              totalNetIfBought(
                contract.monthly_net_cents,
                contract.term_months,
                contract.down_payment_cents,
                contract.buyout_net_cents
              ),
              intlLocale[locale]
            )}
          </p>
          <p>{t('end.taxHint')}</p>
        </div>
      )}
      {invoices.length === 0 ? (
        <p className="mt-3 text-sm">{t('engine.noInvoices')}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
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
                  <td className="px-2 py-2">
                    {operator ? (
                      invoice.number
                    ) : (
                      <Link
                        className="font-semibold underline underline-offset-4"
                        href={`/${locale}/invoices/${invoice.invoiceId}`}
                      >
                        {invoice.number}
                      </Link>
                    )}
                  </td>
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
    </section>
  );
}
