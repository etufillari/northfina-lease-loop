// The dealer section: a tab bar over every dealer page (Returns, Next month).
import { notFound } from 'next/navigation';
import { DealerTabs } from '@/components/dealer/dealer-tabs';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';

export default async function DealerLayout({ children, params }: LayoutProps<'/[locale]/dealer'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);

  return (
    <>
      <DealerTabs
        locale={locale}
        label={t('dealer.nav.label')}
        tabs={[
          { slug: 'returns', text: t('dealer.nav.returns') },
          { slug: 'forecast', text: t('dealer.nav.forecast') },
        ]}
      />
      {children}
    </>
  );
}
