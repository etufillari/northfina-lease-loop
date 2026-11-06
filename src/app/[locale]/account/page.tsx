import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { loadAssets } from '@/data/load';
import { LeaseEnginePanel } from '@/components/lease-engine-panel';
import type { Customer } from '@/data/schemas';
import { getRemainingMonths } from '@/domain/end-of-term-options';
import { formatEuro } from '@/domain/money';
import { anniversary } from '@/domain/lease-engine/calendar';
import type { LeaseStatus } from '@/domain/lease-engine/types';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getActiveUser } from '@/server/active-user';
import { db } from '@/server/db';
import { listContractsForCustomer } from '@/server/applications';
import { todayIso } from '@/server/today';

export default async function AccountPage({ params }: PageProps<'/[locale]/account'>) {
  const { locale } = await params;
  if (!isLocale(locale) || process.env.NODE_ENV !== 'development') notFound();

  await connection();
  const t = getT(locale);
  const today = todayIso();
  const [customer, assets] = await Promise.all([getActiveUser(), loadAssets()]);
  const persistedLeases = customer ? await listContractsForCustomer(db, customer.id) : [];
  const leases = persistedLeases.map((lease) => ({ ...lease, isMock: false }));
  const leaseStatusLabels: Record<LeaseStatus | 'SIGNED', string> = {
    SIGNED: t('engine.signed'),
    ACTIVE: t('account.leaseStatus.active'),
    COMPLETED: t('account.leaseStatus.completed'),
    TERMINATED: t('account.leaseStatus.terminated'),
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`/${locale}`}
        className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
      >
        {t('account.backToCatalogue')}
      </Link>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
        {t('account.title')}
      </h1>

      <Link href={`/${locale}/circular`} className="mt-4 inline-block font-semibold underline">
        {t('circular.title')}
      </Link>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
          <h2 className="text-xl font-semibold">{t('account.profile')}</h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('account.readOnly')}</p>
          {customer ? (
            <CustomerDetails
              customer={customer}
              labels={{
                name: t('account.name'),
                email: t('account.email'),
                customerType: t('account.customerType'),
                customerTypes: {
                  consumer: t('customerType.consumer'),
                  sole_trader: t('customerType.sole_trader'),
                  company: t('customerType.company'),
                },
                location: t('account.location'),
                businessId: t('account.businessId'),
                vatRegistered: t('account.vatRegistered'),
                yes: t('account.yes'),
                no: t('account.no'),
              }}
            />
          ) : (
            <p className="mt-6 rounded-lg bg-stone-100 p-4 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-200">
              {t('account.noActiveCustomer')}
            </p>
          )}
        </section>

        <div className="grid content-start gap-6">
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
            <h2 className="text-xl font-semibold">{t('account.leases')}</h2>
            {leases.length > 0 ? (
              <div className="mt-5 space-y-4">
                {leases.map((lease) => {
                  const asset = assets.find((item) => item.id === lease.terms.assetId);
                  const endDate = anniversary(lease.terms.startDate, lease.terms.termMonths);
                  const remainingMonths = getRemainingMonths(
                    today,
                    lease.terms.startDate,
                    lease.terms.termMonths
                  );

                  return (
                    <details
                      key={lease.terms.contractId}
                      className="group rounded-xl border border-stone-200 dark:border-stone-700"
                    >
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 [&::-webkit-details-marker]:hidden">
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                          <span className="font-semibold">
                            {asset ? `${asset.make} ${asset.model}` : lease.terms.assetId}
                          </span>
                          <span className="text-sm text-stone-600 dark:text-stone-400">
                            {remainingMonths.ok
                              ? t('account.monthsRemaining', { count: remainingMonths.months })
                              : t('account.endOfTerm.dateError')}
                          </span>
                        </span>
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
                          {lease.isMock ? t('account.mockLease') : t('account.savedLease')}
                        </span>
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          fill="none"
                          className="h-5 w-5 shrink-0 text-stone-500 transition-transform group-open:rotate-180"
                        >
                          <path
                            d="m5 7.5 5 5 5-5"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                          />
                        </svg>
                      </summary>
                      <div className="border-t border-stone-200 p-4 dark:border-stone-700">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            {asset ? (
                              <Link
                                href={`/${locale}/assets/${asset.id}`}
                                className="font-semibold text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300"
                              >
                                {t('account.viewAsset')}
                              </Link>
                            ) : null}
                            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                              {t('account.contractId')}: {lease.terms.contractId}
                            </p>
                          </div>
                        </div>
                        <dl className="mt-4 grid gap-3 border-t border-stone-200 pt-4 sm:grid-cols-2 dark:border-stone-700">
                          <LeaseFact
                            label={t('account.leaseStatus')}
                            value={leaseStatusLabels[lease.status]}
                          />
                          <LeaseFact
                            label={t('account.signedDate')}
                            value={formatIsoDate(lease.signedDate, locale)}
                          />
                          <LeaseFact
                            label={t('account.leaseStartDate')}
                            value={formatIsoDate(lease.terms.startDate, locale)}
                          />
                          <LeaseFact
                            label={t('account.leaseEndDate')}
                            value={endDate.ok ? formatIsoDate(endDate.value, locale) : '—'}
                          />
                          <LeaseFact
                            label={t('account.term')}
                            value={t('pricing.months', { count: lease.terms.termMonths })}
                          />
                          <LeaseFact
                            label={t('account.monthlyNetRent')}
                            value={formatEuro(lease.terms.monthlyNetCents, intlLocale[locale])}
                          />
                        </dl>
                        <LeaseEnginePanel
                          contractId={lease.terms.contractId}
                          leaseId={lease.leaseId}
                          status={lease.status}
                          locale={locale}
                        />
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">
                {t('account.noLeases')}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function LeaseFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function CustomerDetails({
  customer,
  labels,
}: {
  customer: Customer;
  labels: {
    name: string;
    email: string;
    customerType: string;
    customerTypes: Record<Customer['type'], string>;
    location: string;
    businessId: string;
    vatRegistered: string;
    yes: string;
    no: string;
  };
}) {
  const details = [
    { label: labels.name, value: customer.name },
    { label: labels.email, value: customer.email },
    { label: labels.customerType, value: labels.customerTypes[customer.type] },
    { label: labels.location, value: `${customer.city}, ${customer.country}` },
    ...('business_id' in customer
      ? [
          { label: labels.businessId, value: customer.business_id },
          {
            label: labels.vatRegistered,
            value: customer.vat_registered ? labels.yes : labels.no,
          },
        ]
      : []),
  ];

  return (
    <dl className="mt-6 divide-y divide-stone-200 dark:divide-stone-800">
      {details.map(({ label, value }) => (
        <div key={label} className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:gap-4">
          <dt className="text-sm text-stone-600 dark:text-stone-400">{label}</dt>
          <dd className="break-words text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
