import { notFound } from 'next/navigation';

import ContractPreview from '@/components/account/contract-preview';
import { isLocale } from '@/i18n/locales';

type Props = {
  params: Promise<{
    locale: string;
    applicationId: string;
  }>;
};

export default async function ContractPage({ params }: Props) {
  const { locale, applicationId } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return <ContractPreview locale={locale} applicationId={applicationId} />;
}
