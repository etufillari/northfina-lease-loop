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
  const t = getT(locale);
  const customer = await getActiveUser();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-7">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('account.title')}</h1>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-slate-950 shadow-sm sm:p-8 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <h2 className="text-xl font-semibold">{t('account.profile')}</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t('account.readOnly')}</p>
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
          <p className="mt-6 rounded-lg bg-slate-100 p-4 text-sm text-slate-700">
            {t('account.noActiveCustomer')}
          </p>
        )}
      </section>
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
    <dl className="mt-6 divide-y divide-slate-200">
      {details.map(({ label, value }) => (
        <div key={label} className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:gap-4">
          <dt className="text-sm text-slate-600 dark:text-slate-300">{label}</dt>
          <dd className="break-words text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
