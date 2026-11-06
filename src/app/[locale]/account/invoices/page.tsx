import { notFound } from 'next/navigation';

import InvoicesList from '@/components/account/invoices-list';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function InvoicesPage({ params }: PageProps) {
  const { locale: localeParam } = await params;

  if (!isLocale(localeParam)) notFound();

  const t = getT(localeParam);

  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-stone-100">{t('account.invoices.title')}</h1>
      </header>

      <InvoicesList locale={localeParam} />
    </section>
  );
}
