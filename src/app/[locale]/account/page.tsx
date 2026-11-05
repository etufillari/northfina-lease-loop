import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { Customer } from '@/data/schemas';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { getActiveUser } from '@/server/active-user';

export default async function AccountPage({ params }: PageProps<'/[locale]/account'>) {
  const { locale } = await params;
  if (!isLocale(locale) || process.env.NODE_ENV !== 'development') notFound();

  await connection();
  const [t, customer] = [getT(locale), await getActiveUser()];

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

        <div className="grid gap-6">
          <HistorySection title={t('account.leases')} message={t('account.historyUnavailable')} />
          <HistorySection title={t('account.invoices')} message={t('account.historyUnavailable')} />
        </div>
      </div>
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

function HistorySection({ title, message }: { title: string; message: string }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">{message}</p>
    </section>
  );
}
