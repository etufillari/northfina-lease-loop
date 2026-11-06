// My leases, the customer portal (D75): for the acting customer everything of theirs in one place
// (the totals, the contracts with their ways out today, the applications not signed yet, every
// invoice), see portal.tsx. Admin sees every contract and application with the customer's name,
// and the customers, each opening their portal at /customers/[id]. Nobody chosen: a pointer to
// "Continue as". Read-only; every read goes through its table owner's function (team rule 3).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Notice, PageHeader } from '@/components/ui';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { authorize } from '@/server/authorize';
import { listCustomers } from '@/server/customers';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { CustomerPortal } from './portal';
import { readLeases } from './portal-data';
import { ApplicationCard, ContractRow } from './rows';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/leases'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('nav.leases') }) };
}

export default async function LeasesPage({ params }: PageProps<'/[locale]/leases'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection(); // the lists change with every signing

  const t = getT(locale);
  const actor = await readActor(db);
  const isAdmin = actor === ADMIN_ACTOR;
  const title = t(isAdmin ? 'nav.leasesAdmin' : 'nav.leases');

  // D73: authorized before any lease is read; a customer reads their own, the admin all.
  const auth = await authorize(
    db,
    actor,
    'read_leases',
    isAdmin ? { none: true } : { customer: actor }
  );
  if (!auth.ok) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <PageHeader title={title} />
        <Notice tone="info">{t('leases.chooseActor')}</Notice>
      </div>
    );
  }

  if (!isAdmin) {
    const today = await todayForRequest();
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <PageHeader title={title} intro={t('leases.intro')} />
        <CustomerPortal customerId={actor} today={today} locale={locale} t={t} />
      </div>
    );
  }

  const [{ contracts, unsigned, assetById }, customers] = await Promise.all([
    readLeases({}),
    listCustomers(db),
  ]);
  const nameOf = (id: string) => customers.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={title} intro={t('leases.introAdmin')} />

      <section aria-labelledby="leases-contracts">
        <h2 id="leases-contracts" className="mb-4 text-2xl">
          {t('leases.contracts')}
        </h2>
        {contracts.length === 0 ? (
          <Notice tone="info">{t('leases.noContracts')}</Notice>
        ) : (
          <ul className="space-y-3">
            {contracts.map((contract) => (
              <li key={contract.id}>
                <ContractRow
                  contract={contract}
                  asset={assetById.get(contract.assetId)}
                  customer={nameOf(contract.customerId)}
                  locale={locale}
                  t={t}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {unsigned.length > 0 ? (
        <section aria-labelledby="leases-applications" className="mt-10">
          <h2 id="leases-applications" className="mb-4 text-2xl">
            {t('leases.applications')}
          </h2>
          <ul className="space-y-3">
            {unsigned.map(({ application, asset }) => (
              <li key={application.id}>
                <ApplicationCard
                  application={application}
                  asset={asset}
                  customer={nameOf(application.customerId)}
                  locale={locale}
                  t={t}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="leases-customers" className="mt-10">
        <h2 id="leases-customers" className="mb-4 text-2xl">
          {t('portal.customers.title')}
        </h2>
        <ul className="divide-y divide-line rounded-xl border border-line bg-raised px-4 shadow-card">
          {customers.map((customer) => (
            <li key={customer.id} className="flex flex-wrap justify-between gap-x-4 py-3">
              <span>{customer.name}</span>
              <Link
                href={`/${locale}/customers/${customer.id}`}
                className="font-bold text-brand-text underline-offset-2 hover:underline"
              >
                {t('portal.customers.open')}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
