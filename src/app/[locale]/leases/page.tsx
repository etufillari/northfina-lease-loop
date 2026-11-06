// A customer's leases, and the way in to their end-of-term choices. There is no login yet,
// so the customer is picked from a list, as in the application flow.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { LeaseList } from '@/components/lease-list';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listCustomers } from '@/server/assets/customers';
import { listCustomerLeases } from '@/server/contracts/customer-leases';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export default async function LeasesPage({ params, searchParams }: PageProps<'/[locale]/leases'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Lease status and payments are live database data.
  await connection();

  const t = getT(locale);
  const { customer: requested } = await searchParams;
  const customers = await listCustomers(db);
  const customer = customers.find((candidate) => candidate.id === requested);
  const leases = customer ? await listCustomerLeases(db, customer.id, todayIso()) : [];

  return (
    <>
      <section className="brand-hero">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="page-title max-w-2xl">{t('leases.title')}</h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-[1.4]">{t('leases.intro')}</p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <form action={`/${locale}/leases`} className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            {t('leases.viewingAs')}
            <select
              name="customer"
              defaultValue={customer?.id ?? ''}
              required
              className="mt-1 block w-full min-w-64 rounded-xl border border-ink-300 bg-white px-3 py-2.5 dark:border-ink-600 dark:bg-ink-950"
            >
              <option value="" disabled>
                {t('leases.chooseCustomer')}
              </option>
              {customers.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-primary">
            {t('leases.show')}
          </button>
        </form>

        {customer ? (
          <LeaseList leases={leases} locale={locale} t={t} />
        ) : (
          <p className="mt-8 text-ink-600 dark:text-ink-400">{t('leases.choosePrompt')}</p>
        )}
      </div>
    </>
  );
}
