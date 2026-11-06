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
  locale,
}: {
  contractId: string;
  leaseId: string | null;
  locale: Locale;
}) {
  const t = getT(locale);
  const invoices = leaseId ? await listLeaseInvoices(db, leaseId) : [];
  const schedule = leaseId ? await getLeaseSchedule(db, leaseId) : null;
  const contract = await db.contract.findUnique({ where: { id: contractId } });
  const state = leaseId ? await db.engineLease.findUnique({ where: { id: leaseId } }) : null;
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
