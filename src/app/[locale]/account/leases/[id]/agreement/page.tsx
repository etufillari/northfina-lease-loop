import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { PrintButton } from '@/components/print-button';
import { loadVatRates } from '@/data/load';
import { invoiceAmounts } from '@/domain/lease-billing';
import { summarizeLease } from '@/domain/lease-dashboard';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { readIdentity } from '@/server/auth-session';
import { db } from '@/server/db';
import { appToday } from '@/server/demo-mode';
import { findCustomerLease } from '@/server/leases';

/** Everything agreed at signing, kept out of the everyday lease page. Prints cleanly to a PDF. */
export default async function Page({
  params,
}: PageProps<'/[locale]/account/leases/[id]/agreement'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const identity = await readIdentity(db, await headers());
  if (!identity) redirect(`/${locale}/login`);
  const lease = await findCustomerLease(db, identity.customerId, id);
  if (!lease) notFound();
  const today = await appToday();
  const vat = await loadVatRates();
  const info = summarizeLease(lease, vat.rates, today);
  const t = getT(locale);
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const startVat = info.forecast.ok ? info.forecast.invoices[0]?.vatBasisPoints : undefined;
  const endVat = info.forecast.ok ? info.forecast.invoices.at(-1)?.vatBasisPoints : undefined;
  const gross = (net: number, basisPoints: number | undefined) =>
    basisPoints === undefined
      ? t('dashboard.forecastUnavailable')
      : money(invoiceAmounts(net, basisPoints).totalCents);
  const rows = [
    [t('product.serialNumber'), lease.asset.serial_number],
    [t('dashboard.started'), formatIsoDate(lease.startDate, locale)],
    [t('dashboard.ends'), formatIsoDate(info.endDate, locale)],
    [t('product.term'), t('product.months', { count: lease.termMonths })],
    [t('agreement.price'), gross(lease.listPriceCents, startVat)],
    [t('agreement.down'), gross(lease.downPaymentCents, startVat)],
    [t('agreement.monthly'), gross(lease.monthlyNetCents, startVat)],
    ...(info.forecastTotalCents !== null
      ? [[t('agreement.total'), money(info.forecastTotalCents)]]
      : []),
    [t('agreement.endPrice'), gross(lease.buyoutCents, endVat)],
  ] as const;
  return (
    <DashboardShell locale={locale} active="leases">
      <Link
        href={`/${locale}/account/leases/${encodeURIComponent(id)}`}
        className="inline-flex min-h-target items-center text-caption text-primary print:hidden"
      >
        ← {t('dashboard.viewLease')}
      </Link>
      <div className="mt-2 max-w-2xl">
        <h2 className="text-tagline font-semibold">{t('agreement.title')}</h2>
        <p className="mt-2 text-body">
          {lease.asset.make} {lease.asset.model}
        </p>
        <dl className="mt-5 divide-y divide-divider">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-3">
              <dt className="text-caption text-ink-muted">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-caption text-ink-muted">{t('agreement.note')}</p>
        {lease.isDemo ? (
          <p className="mt-2 text-caption text-ink-muted">{t('dashboard.demoNotice')}</p>
        ) : null}
        <div className="mt-6">
          <PrintButton label={t('agreement.print')} />
        </div>
      </div>
    </DashboardShell>
  );
}
