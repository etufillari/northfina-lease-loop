import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { CoLeaseManager } from '@/components/co-lease-manager';
import { DashboardShell } from '@/components/dashboard-shell';
import { loadVatRates } from '@/data/load';
import { sharesOn } from '@/domain/co-lease';
import { summarizeLease } from '@/domain/lease-dashboard';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { readIdentity } from '@/server/auth-session';
import { listCoLeaseCandidates } from '@/server/co-lease';
import { db } from '@/server/db';
import { appToday } from '@/server/demo-mode';
import { findCustomerLease } from '@/server/leases';

export default async function Page({
  params,
}: PageProps<'/[locale]/account/leases/[id]/co-lease'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const identity = await readIdentity(db, await headers());
  if (!identity) redirect(`/${locale}/login`);
  const lease = await findCustomerLease(db, identity.customerId, id);
  if (!lease) notFound();
  const today = await appToday();
  const [vat, candidates] = await Promise.all([loadVatRates(), listCoLeaseCandidates(db)]);
  const next = summarizeLease(lease, vat.rates, today).next;
  const current = sharesOn(lease.coLeaseShares, today);
  const t = getT(locale);
  return (
    <DashboardShell locale={locale} active="leases">
      <Link
        href={`/${locale}/account/leases/${encodeURIComponent(id)}`}
        className="inline-flex min-h-target items-center text-caption text-primary"
      >
        ← {t('dashboard.viewLease')}
      </Link>
      <h2 className="mt-2 text-tagline font-semibold">
        {t('colease.title')}: {lease.asset.make} {lease.asset.model}
      </h2>
      {lease.status === 'active' ? (
        <CoLeaseManager
          locale={locale}
          leaseId={id}
          holder={{ id: identity.id, name: identity.name }}
          current={current.map((share) => ({
            id: share.user.id,
            name: share.user.name,
            percent: share.percent,
          }))}
          candidates={candidates}
          nextPaymentCents={next?.amountCents ?? null}
        />
      ) : (
        <p className="mt-6 rounded-lg bg-parchment p-6">{t('colease.inactive')}</p>
      )}
    </DashboardShell>
  );
}
