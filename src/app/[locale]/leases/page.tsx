import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { EndOfTermOptions } from '@/components/end-of-term-options';
import { loadAssets } from '@/data/load';
import { getEndOfTermChoices, getRemainingMonths } from '@/domain/end-of-term-options';
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

export default async function LeasesPage({ params }: PageProps<'/[locale]/leases'>) {
  const { locale } = await params;
  if (!isLocale(locale) || process.env.NODE_ENV !== 'development') notFound();

  await connection();
  const t = getT(locale);
  const today = todayIso();
  const [customer, assets] = await Promise.all([getActiveUser(), loadAssets()]);
  const leases = customer ? await listContractsForCustomer(db, customer.id) : [];
  const leaseStatusLabels: Record<LeaseStatus | 'SIGNED', string> = {
    SIGNED: t('engine.signed'),
    ACTIVE: t('account.leaseStatus.active'),
    COMPLETED: t('account.leaseStatus.completed'),
    TERMINATED: t('account.leaseStatus.terminated'),
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-7">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('account.title')}</h1>

      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
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
              const endOptions =
                endDate.ok && lease.status === 'ACTIVE'
                  ? getEndOfTermChoices(today, endDate.value, lease.latestInvoicePaid)
                  : null;

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
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200 ring-inset dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800">
                      {t('account.savedLease')}
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
                    {endOptions?.ok && endOptions.choices.length > 0 ? (
                      <EndOfTermOptions
                        leaseId={lease.terms.contractId}
                        choices={endOptions.choices}
                        labels={{
                          title: t('account.endOfTerm.title'),
                          prompt: t('account.endOfTerm.prompt'),
                          demoNote: t('account.endOfTerm.demoNote'),
                          selected: t('account.endOfTerm.selected'),
                          choices: {
                            return: {
                              title: t('account.endOfTerm.return.title'),
                              description: t('account.endOfTerm.return.description'),
                            },
                            buy: {
                              title: t('account.endOfTerm.buy.title'),
                              description: t('account.endOfTerm.buy.description'),
                            },
                            extend: {
                              title: t('account.endOfTerm.extend.title'),
                              description: t('account.endOfTerm.extend.description'),
                            },
                            endEarly: {
                              title: t('account.endOfTerm.earlyTermination.title'),
                              description: t('account.endOfTerm.earlyTermination.description'),
                            },
                          },
                        }}
                      />
                    ) : null}
                    {lease.status === 'ACTIVE' && endDate.ok && endOptions?.ok === false ? (
                      <p className="mt-5 text-sm text-red-700 dark:text-red-300">
                        {t('account.endOfTerm.dateError')}
                      </p>
                    ) : null}
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">{t('account.noLeases')}</p>
        )}
      </section>
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
