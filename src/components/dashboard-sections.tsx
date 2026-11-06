import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { loadVatRates } from '@/data/load';
import { paymentStatus } from '@/domain/lease-billing';
import { holderShareCents, sharesOn } from '@/domain/co-lease';
import { paidForInvoice, summarizePortfolio } from '@/domain/lease-dashboard';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale, type Locale } from '@/i18n/locales';
import { readIdentity } from '@/server/auth-session';
import { db } from '@/server/db';
import { listCustomerLeases, type CustomerLease } from '@/server/leases';
import { appToday } from '@/server/demo-mode';
import { issueDueInvoices } from '@/server/invoice-issuance';
import { DashboardShell, type DashboardSection } from './dashboard-shell';
import { CancelLeaseRequest } from './cancel-lease-request';
import { LeaseCard } from './lease-card';
import { DemoLeaseButton } from './lease-controls';

export async function DashboardSectionPage({
  locale,
  section,
}: {
  locale: string;
  section: Exclude<DashboardSection, 'settings'>;
}) {
  if (!isLocale(locale)) notFound();
  const identity = await readIdentity(db, await headers());
  if (!identity) redirect(`/${locale}/login`);
  const today = await appToday();
  // Bill the months that came due since the last visit, before showing them.
  await issueDueInvoices(db, identity.customerId, today);
  const [leases, vat] = await Promise.all([
    listCustomerLeases(db, identity.customerId),
    loadVatRates(),
  ]);
  const t = getT(locale);
  return (
    <DashboardShell locale={locale} active={section}>
      {section === 'overview' ? (
        <Overview
          locale={locale}
          leases={leases}
          rates={vat.rates}
          today={today}
          name={identity.name}
        />
      ) : null}
      {section === 'leases' ? (
        <>
          <h2 className="text-tagline font-semibold">{t('dashboard.leases')}</h2>
          <LeaseList locale={locale} leases={leases} rates={vat.rates} today={today} />
        </>
      ) : null}
      {section === 'payments' ? <Payments locale={locale} leases={leases} today={today} /> : null}
      {section === 'requests' ? <Requests locale={locale} leases={leases} /> : null}
    </DashboardShell>
  );
}

type Props = {
  locale: Locale;
  leases: CustomerLease[];
  rates: Awaited<ReturnType<typeof loadVatRates>>['rates'];
  today: string;
};
function LeaseList({ locale, leases, rates, today }: Props) {
  const t = getT(locale);
  if (!leases.length)
    return (
      <div className="mt-6 rounded-lg border border-hairline bg-canvas p-card">
        <h3 className="text-tagline font-semibold">{t('dashboard.emptyTitle')}</h3>
        <p className="mt-3 text-body text-ink-muted">{t('dashboard.emptyText')}</p>
        <Link
          href={`/${locale}`}
          className="mt-3 inline-flex min-h-target items-center text-primary"
        >
          {t('dashboard.browse')} →
        </Link>
        {process.env.NODE_ENV === 'development' ? <DemoLeaseButton locale={locale} /> : null}
      </div>
    );
  return (
    <>
      <ul className="mt-5 grid gap-5 tablet:grid-cols-2">
        {leases.map((lease) => (
          <li key={lease.id}>
            <LeaseCard lease={lease} rates={rates} today={today} locale={locale} />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-caption text-ink-muted">{t('dashboard.allIncludeVat')}</p>
    </>
  );
}
function Overview({ locale, leases, rates, today, name }: Props & { name: string }) {
  const t = getT(locale);
  const {
    activeCount,
    realPaidCents,
    demoPaidCents,
    outstandingCents,
    demoOutstandingCents,
    next,
  } = summarizePortfolio(leases, rates, today);
  return (
    <>
      <h2 className="text-tagline font-semibold">{t('account.welcome', { name })}</h2>
      <p className="mt-2 text-body text-ink-muted">{t('dashboard.intro')}</p>
      <div className="mt-6 grid gap-4 grid:grid-cols-2 desktop:grid-cols-4">
        <Metric label={t('dashboard.activeCount')} value={String(activeCount)} />
        <Metric
          label={t('dashboard.totalPaid')}
          value={formatEuro(realPaidCents + demoPaidCents, intlLocale[locale])}
          note={t('customer.rentPayments')}
        />
        <Metric
          label={t('dashboard.outstanding')}
          value={formatEuro(outstandingCents + demoOutstandingCents, intlLocale[locale])}
        />
        <Metric
          label={t('dashboard.nextPayment')}
          value={next ? formatEuro(next.shareCents, intlLocale[locale]) : t('dashboard.noNext')}
          note={next ? formatIsoDate(next.dueDate, locale) : undefined}
        />
      </div>
      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-tagline font-semibold">{t('dashboard.leases')}</h2>
        <Link href={`/${locale}/account/leases`} className="text-body text-primary">
          {t('dashboard.viewAll')} →
        </Link>
      </div>
      <LeaseList locale={locale} leases={leases} rates={rates} today={today} />
    </>
  );
}
function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-card">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="mt-3 text-tagline font-semibold tabular-nums">{value}</p>
      {note ? <p className="mt-2 text-caption text-ink-muted">{note}</p> : null}
    </div>
  );
}
function Payments({
  locale,
  leases,
  today,
}: {
  locale: Locale;
  leases: CustomerLease[];
  today: string;
}) {
  const t = getT(locale);
  const invoices = leases
    .flatMap((lease) =>
      lease.invoices
        .filter((invoice) => invoice.status === 'issued')
        .map((invoice) => ({ invoice, lease }))
    )
    .sort((a, b) => b.invoice.dueDate.localeCompare(a.invoice.dueDate));
  return (
    <>
      <h2 className="text-tagline font-semibold">{t('dashboard.issuedInvoices')}</h2>
      <p className="mt-3 text-body text-ink-muted">{t('dashboard.paymentsIntro')}</p>
      {invoices.length ? (
        <ul className="mt-6 space-y-3">
          {invoices.map(({ invoice, lease }) => {
            const total = invoice.netCents + invoice.vatCents;
            const paid = paidForInvoice(invoice, lease.isDemo);
            const status = paymentStatus(total, paid, invoice.dueDate, today);
            return (
              <li key={invoice.id} className="rounded-lg border border-hairline bg-canvas p-card">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <Link
                      href={`/${locale}/account/leases/${lease.id}`}
                      className="font-semibold text-primary"
                    >
                      {lease.asset.make} {lease.asset.model}
                    </Link>
                    <p className="mt-2 text-caption text-ink-muted">
                      {formatIsoDate(invoice.dueDate, locale)} ·{' '}
                      {t(lease.isDemo ? 'dashboard.demo' : 'dashboard.issued')}
                    </p>
                  </div>
                  <div>
                    <p className="text-body font-semibold">
                      {formatEuro(total, intlLocale[locale])}
                    </p>
                    <p className="mt-2 text-caption">{t(`dashboard.invoiceStatus.${status}`)}</p>
                  </div>
                </div>
                <p className="mt-4 text-caption text-ink-muted">
                  {t('dashboard.paidAmount', { amount: formatEuro(paid, intlLocale[locale]) })}
                </p>
                {sharesOn(lease.coLeaseShares, invoice.dueDate).length > 1 ? (
                  <p className="mt-1 text-caption text-ink-muted">
                    {t('colease.yourShare', {
                      amount: formatEuro(
                        holderShareCents(total, lease.coLeaseShares, invoice.dueDate),
                        intlLocale[locale]
                      ),
                    })}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-6 rounded-lg border border-hairline bg-canvas p-card">
          {t('dashboard.noInvoices')}
        </p>
      )}
    </>
  );
}
function Requests({ locale, leases }: { locale: Locale; leases: CustomerLease[] }) {
  const t = getT(locale);
  const requests = leases
    .flatMap((lease) => lease.requests.map((request) => ({ lease, request })))
    .sort((a, b) => b.request.createdAt.getTime() - a.request.createdAt.getTime());
  return (
    <>
      <h2 className="text-tagline font-semibold">{t('dashboard.requests')}</h2>
      <p className="mt-3 text-body text-ink-muted">{t('dashboard.requestsIntro')}</p>
      {requests.length ? (
        <ul className="mt-6 space-y-3">
          {requests.map(({ lease, request }) => (
            <li key={request.id} className="rounded-lg border border-hairline bg-canvas p-card">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-semibold">{t(`dashboard.request.${request.kind}`)}</p>
                  <Link
                    href={`/${locale}/account/leases/${lease.id}`}
                    className="mt-2 inline-block text-caption text-primary"
                  >
                    {lease.asset.make} {lease.asset.model}
                  </Link>
                </div>
                <div className="text-right">
                  <p className="text-caption">{t(`dashboard.requestStatus.${request.status}`)}</p>
                  {lease.status === 'active' &&
                  ['pending', 'approved'].includes(request.status) &&
                  (!request.assessment ||
                    ['quoted', 'accepted'].includes(request.assessment.status)) &&
                  !lease.actionPayments.some((payment) => payment.kind === 'return') ? (
                    <CancelLeaseRequest
                      locale={locale}
                      contractId={lease.id}
                      requestId={request.id}
                    />
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-lg border border-hairline bg-canvas p-card">
          {t('dashboard.noRequests')}
        </p>
      )}
    </>
  );
}
