import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { LeaseDetail } from '@/components/lease-detail';
import { mailtoHref } from '@/components/mailto';
import { loadCo2Factors, loadVatRates } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { AWAITING_SIGNATURE } from '@/domain/signatory';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getT } from '@/i18n/get-t';
import { authSettings } from '@/server/auth-config';
import { readIdentity } from '@/server/auth-session';
import { signingLink } from '@/server/contract-signing';
import { db } from '@/server/db';
import { findCustomerLease } from '@/server/leases';
import { leaseActionContext } from '@/server/lease-actions';
import { appToday, demoModeEnabled } from '@/server/demo-mode';
import { issueDueInvoices } from '@/server/invoice-issuance';

export default async function LeaseDetailPage({
  params,
}: PageProps<'/[locale]/account/leases/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const identity = await readIdentity(db, await headers());
  if (!identity) redirect(`/${locale}/login`);
  const today = await appToday();
  // Bill the months that came due since the last visit, before showing them.
  await issueDueInvoices(db, identity.customerId, today);
  const lease = await findCustomerLease(db, identity.customerId, id);
  if (!lease) notFound();
  const [vat, factors] = await Promise.all([loadVatRates(), loadCo2Factors()]);
  const liveBuyout =
    lease.status === 'active' ? await leaseActionContext(db, identity.customerId, id, today) : null;
  const t = getT(locale);
  // Card 6: while the company's signatory hasn't signed, offer the link to send them.
  const link =
    lease.status === AWAITING_SIGNATURE && lease.signatoryEmail
      ? signingLink(authSettings(), locale, lease.id)
      : null;
  const signing =
    link && lease.signatoryEmail
      ? {
          email: lease.signatoryEmail,
          emailHref: mailtoHref(
            t('signing.emailSubject', { item: `${lease.asset.make} ${lease.asset.model}` }),
            t('signing.emailBody', {
              company: identity.name,
              item: `${lease.asset.make} ${lease.asset.model}`,
              months: t('product.months', { count: lease.termMonths }),
              monthly: formatEuro(lease.monthlyNetCents, intlLocale[locale]),
              link,
            }),
            lease.signatoryEmail
          ),
          demoLink: demoModeEnabled() ? link : null,
        }
      : undefined;
  return (
    <DashboardShell locale={locale} active="leases">
      <Link
        href={`/${locale}/account/leases`}
        className="inline-flex min-h-target items-center text-primary"
      >
        ← {t('dashboard.leases')}
      </Link>
      <LeaseDetail
        locale={locale}
        lease={lease}
        rates={vat.rates}
        factors={factors}
        today={today}
        liveBuyoutTotalCents={liveBuyout?.quote.buyoutTotalCents}
        signing={signing}
      />
    </DashboardShell>
  );
}
