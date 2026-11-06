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

  const t = getT(localeParam);

  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-stone-100">{t('account.applications.title')}</h1>

        <p className="mt-2 text-sm text-stone-400">{t('account.applications.description')}</p>
      </header>

      <ApplicationsList locale={localeParam} />
    </section>
  );
}
