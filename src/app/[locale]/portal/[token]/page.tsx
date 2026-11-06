import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getContractByAccessToken } from '@/server/customer-access';
import { db } from '@/server/db';

export default async function CustomerPortalPage({
  params,
}: PageProps<'/[locale]/portal/[token]'>) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();

  let contract;
  try {
    contract = await getContractByAccessToken(db, token);
  } catch {
    notFound();
  }
  const t = getT(locale);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
        {t('portal.step')}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        {t('portal.title')}
      </h1>
      <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">{t('portal.description')}</p>
      <section className="mt-8 rounded-2xl border border-stone-200 p-6 dark:border-stone-800">
        <h2 className="text-xl font-semibold">{t('portal.contractTitle')}</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Fact label={t('portal.status')} value={contract.status} />
          <Fact
            label={t('portal.monthlyRent')}
            value={formatEuro(contract.monthly_net_rent_cents, intlLocale[locale])}
          />
          <Fact label={t('portal.startDate')} value={formatIsoDate(contract.start_date, locale)} />
          <Fact label={t('portal.endDate')} value={formatIsoDate(contract.end_date, locale)} />
        </dl>
      </section>
      <Link
        href={`/${locale}`}
        className="mt-8 inline-flex rounded-xl border border-stone-300 px-5 py-3 font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
      >
        {t('contract.backToCatalogue')}
      </Link>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
