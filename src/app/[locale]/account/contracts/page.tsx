import { notFound } from 'next/navigation';

import ContractsList from '@/components/account/contracts-list';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function MyContractsPage({ params }: PageProps) {
  const { locale: localeParam } = await params;

  if (!isLocale(localeParam)) notFound();

  const t = getT(localeParam);

  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-stone-100">{t('account.contracts.title')}</h1>
      </header>

      <ContractsList locale={localeParam} />
    </section>
  );
}
