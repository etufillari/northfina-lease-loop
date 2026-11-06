import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';

export default async function ContractPage({ params }: PageProps<'/[locale]/contract'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
        {t('contract.step')}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        {t('contract.title')}
      </h1>
      <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">{t('contract.description')}</p>
      <Link
        href={`/${locale}`}
        className="mt-8 inline-flex rounded-xl border border-stone-300 px-5 py-3 font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
      >
        {t('contract.backToCatalogue')}
      </Link>
    </div>
  );
}
