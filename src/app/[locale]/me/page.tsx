// "My page": the selected persona's contracts, each with its next invoice highlighted.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { PERSONA_COOKIE } from '@/components/persona-cookie';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { asOfFromPage } from '@/server/as-of';
import { listCustomerContracts } from '@/server/contracts';
import { getCustomer } from '@/server/customers';
import { db } from '@/server/db';

export default async function MePage({ params, searchParams }: PageProps<'/[locale]/me'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const { asOf, asOfParam } = await asOfFromPage(await searchParams);
  const suffix = asOfParam ? `?asOf=${asOfParam}` : '';

  const persona = (await cookies()).get(PERSONA_COOKIE)?.value ?? null;
  const customer = persona ? await getCustomer(db, persona) : null;

  if (!customer) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t('me.title')}</h1>
        <p className="mt-4 text-stone-700 dark:text-stone-300">{t('me.noPersona')}</p>
      </div>
    );
  }

  const contracts = await listCustomerContracts(db, customer.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{customer.name}</h1>
      <p className="mt-1 text-stone-600 dark:text-stone-400">{customer.email}</p>

      <h2 className="mt-8 text-xl font-semibold">{t('me.contracts')}</h2>
      {contracts.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('me.noContracts')}
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {contracts.map((contract) => {
            const open = [...contract.invoices].filter((i) => i.due_date <= asOf).at(-1);
            return (
              <li
                key={contract.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {contract.assets.map((a) => a.asset_id).join(', ')} ·{' '}
                      {t('price.months', { months: contract.term_months })}
                    </p>
                    <p className="text-sm text-stone-600 dark:text-stone-400">
                      {formatIsoDate(contract.start_date, locale)} ·{' '}
                      {euro(contract.monthly_net_rent_cents)} {t('price.exclVat')}{' '}
                      {t('common.perMonth')}
                    </p>
                  </div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium ring-1 ring-stone-200 ring-inset dark:bg-stone-800 dark:ring-stone-700">
                    {t(`contract.status.${contract.status}` as MessageKey)}
                  </span>
                </div>
                {open ? (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
                    {t('invoice.state.open')}: #{open.number} ·{' '}
                    {formatIsoDate(open.due_date, locale)} · {euro(open.total_cents)}
                  </p>
                ) : null}
                <Link
                  href={`/${locale}/contracts/${contract.id}${suffix}`}
                  className="mt-3 inline-block text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                >
                  {t('me.viewContract')} →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
