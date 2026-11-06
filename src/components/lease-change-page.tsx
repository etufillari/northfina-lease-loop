import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { DashboardShell } from './dashboard-shell';
import { ReturnRequestForm } from './return-request-form';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { readIdentity } from '@/server/auth-session';
import { db } from '@/server/db';
import { leaseActionContext } from '@/server/lease-actions';
import { checkoutOptions } from '@/server/checkout-options';
import { appToday } from '@/server/demo-mode';

export async function LeaseChangePage({
  locale,
  id,
  mode,
}: {
  locale: string;
  id: string;
  mode: 'return' | 'exchange';
}) {
  if (!isLocale(locale)) notFound();
  const identity = await readIdentity(db, await headers());
  if (!identity) redirect(`/${locale}/login`);
  const owned = await db.contract.findFirst({
    where: { id, customerId: identity.customerId },
    select: { id: true },
  });
  if (!owned) notFound();
  const today = await appToday();
  const context = await leaseActionContext(db, identity.customerId, id, today);
  const t = getT(locale);
  return (
    <DashboardShell locale={locale} active="leases">
      <Link
        href={`/${locale}/account/leases/${id}`}
        className="inline-flex min-h-target items-center text-caption text-primary"
      >
        ← {t('dashboard.viewLease')}
      </Link>
      <h2 className="mt-3 text-display-sm font-semibold">
        {t(mode === 'exchange' ? 'flow.exchangeTitle' : 'return.title')}
      </h2>
      <p className="mt-3 max-w-2xl text-body text-ink-muted">
        {t(mode === 'exchange' ? 'flow.exchangeIntro' : 'flow.returnIntro')}
      </p>
      {context.contract.status === 'active' ? (
        <ReturnRequestForm
          locale={locale}
          contractId={id}
          assetId={context.contract.assetId}
          name={`${context.contract.asset.make} ${context.contract.asset.model}`}
          data={{
            baselineCondition: context.baselineCondition,
            finance: context.finance,
            recoveryFacts: context.recoveryFacts,
            costs: context.costs,
            curves: context.curves,
          }}
          baselineUsage={context.baselineUsage}
          usageValue={context.contract.asset.usage_value}
          usageUnit={context.contract.asset.usage_unit}
          today={today}
          mode={mode}
          replacements={mode === 'exchange' ? await checkoutOptions(today) : undefined}
        />
      ) : (
        <p className="mt-6">{t('dashboard.requestUnavailable')}</p>
      )}
    </DashboardShell>
  );
}
