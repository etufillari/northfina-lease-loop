import { notFound } from 'next/navigation';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';

export default async function ApplicationPage({ params }: PageProps<'/[locale]/apply'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getT(locale);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {t('application.step')}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('application.title')}
        </h1>
        <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">{t('application.intro')}</p>
      </header>

      <section
        aria-labelledby="application-coming-soon"
        className="mt-10 rounded-2xl border border-dashed border-stone-300 bg-white p-6 dark:border-stone-700 dark:bg-stone-900"
      >
        <h2 id="application-coming-soon" className="text-lg font-semibold">
          {t('application.comingSoonTitle')}
        </h2>
        <p className="mt-2 text-stone-700 dark:text-stone-300">
          {t('application.comingSoonDescription')}
        </p>
      </section>
    </div>
  );
}
