import { notFound } from 'next/navigation';
import { Journey } from '@/components/spine/journey';
import { isLocale } from '@/i18n/locales';

export default async function LeasePage({ params }: PageProps<'/[locale]/lease/[assetId]'>) {
  const { locale, assetId } = await params;
  if (!isLocale(locale)) notFound();
  return <Journey assetId={assetId} locale={locale} />;
}
