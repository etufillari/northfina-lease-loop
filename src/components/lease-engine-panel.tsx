import { totalNetIfBought } from '@/domain/circular/money';
import { db } from '@/server/db';
import { listLeaseInvoices } from '@/server/lease-engine/invoices';
import { getLeaseSchedule } from '@/server/lease-engine/queries';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { LeaseEngineActions } from './lease-engine-actions';
import { ReturnRequest } from './return-request';
import { usageUnitSchema } from '@/data/schemas';

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
  const [invoices, schedule, settlement, contract, state, returnRecord] = await Promise.all([
    leaseId ? listLeaseInvoices(db, leaseId) : [],
    leaseId ? getLeaseSchedule(db, leaseId) : null,
    leaseId ? db.leaseSettlement.findUnique({ where: { leaseId } }) : null,
    db.contract.findUnique({ where: { id: contractId } }),
    leaseId ? db.engineLease.findUnique({ where: { id: leaseId } }) : null,
    leaseId ? db.assetReturn.findUnique({ where: { leaseId } }) : null,
  ]);
  const returnAsset = state ? await db.asset.findUnique({ where: { id: state.assetId } }) : null;
  const returnUsageUnit = returnAsset ? usageUnitSchema.parse(returnAsset.usage_unit) : null;
  const usageUnitLabels = {
    km: t('usage.unit.km'),
    battery_cycles: t('usage.unit.battery_cycles'),
    engine_hours: t('usage.unit.engine_hours'),
  };
  const periods = (schedule?.periods ?? [])
    .filter((period) => !state?.terminatedOn || period.startDate < state.terminatedOn)
    .filter((period) => !invoices.some((invoice) => invoice.periodIndex === period.index))
    .slice(0, 3);
  return (
    <section className="mt-5 border-t border-stone-200 pt-4 dark:border-stone-700">
      <h3 className="font-semibold">{t('engine.costDetails')}</h3>
      {contract && contract.financed_cents > 0 && (
        <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-stone-800/60">
          {schedule && (
            <LeaseCost
              label={t('engine.totalNet')}
              value={formatEuro(schedule.totalNetCents, intlLocale[locale])}
            />
          )}
          <LeaseCost
            label={t('end.down')}
            value={formatEuro(contract.down_payment_cents, intlLocale[locale])}
          />
          <LeaseCost
            label={t('end.buyoutNet')}
            value={formatEuro(contract.buyout_net_cents, intlLocale[locale])}
          />
          <LeaseCost
            label={t('end.totalNet')}
            value={formatEuro(
              totalNetIfBought(
                contract.monthly_net_cents,
                contract.term_months,
                contract.down_payment_cents,
                contract.buyout_net_cents
              ),
              intlLocale[locale]
            )}
          />
        </dl>
      )}
      <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">{t('end.taxHint')}</p>
      <div className="mt-5 border-t border-stone-200 pt-4 dark:border-stone-700">
        <h4 className="font-semibold">{t('engine.actions')}</h4>
        <LeaseEngineActions
          leaseId={leaseId}
          pendingPeriods={periods.map((period) => period.index)}
          locale={locale}
          labels={{
            buyout: t('end.buy'),
            passOn: t('end.pass'),
            releaseEarlier: t('end.early'),
            generate: t('engine.generate'),
            busy: t('engine.busy'),
            error: t('engine.error'),
          }}
        />
      </div>
      {settlement && (
        <p className="mt-3">
          {t('end.recorded')}: {settlement.option} ·{' '}
          {formatEuro(settlement.grossCents, intlLocale[locale])} · {settlement.effectiveOn}
        </p>
      )}
      {leaseId &&
        ['COMPLETED', 'TERMINATED'].includes(status) &&
        settlement?.option !== 'BUYOUT' &&
        returnAsset && (
          <ReturnRequest
            leaseId={leaseId}
            usageValue={returnRecord?.usageValue ?? returnAsset.usage_value}
            usageUnit={returnAsset.usage_unit}
            status={returnRecord?.status ?? null}
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
              unit: returnUsageUnit ? usageUnitLabels[returnUsageUnit] : '',
            }}
          />
        )}
      {status === 'COMPLETED' && <p className="mt-4 font-medium">{t('engine.awaitingReturn')}</p>}
    </section>
  );
}

function LeaseCost({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
