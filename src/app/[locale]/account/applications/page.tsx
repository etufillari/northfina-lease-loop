import { notFound } from 'next/navigation';

import ApplicationsList from '@/components/account/applications-list';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function MyApplicationsPage({ params }: PageProps) {
  const { locale: localeParam } = await params;

  if (!isLocale(localeParam)) notFound();

  const locale = localeParam;
  const t = getT(locale);

  return (
    <main className="min-h-screen bg-stone-950 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-stone-100">
            {t('account.applications.title')}
          </h1>

          <p className="mt-2 text-sm text-stone-400">{t('account.applications.description')}</p>
        </header>

        <ApplicationsList locale={locale} />
      </div>
    </main>
  );
}
