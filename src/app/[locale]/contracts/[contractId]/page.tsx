import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ContractView } from '@/components/contract-view';
import { isLocale } from '@/i18n/locales';
import { getCustomerContract } from '@/server/contracts/contract-view';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export default async function CustomerContractPage({
  params,
}: PageProps<'/[locale]/contracts/[contractId]'>) {
  const { locale, contractId } = await params;
  if (!isLocale(locale)) notFound();

  // Contract status and invoice payments are live database data.
  await connection();

  const today = todayIso();
  const view = await getCustomerContract(db, contractId, today);
  if (!view) notFound();

  return <ContractView locale={locale} view={view} today={today} />;
}
