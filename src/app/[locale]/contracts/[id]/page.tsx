// A signed lease contract, ready to print or save as PDF. Every price on it was copied at
// signing; nothing here is recalculated from today's price lists.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ContractDocument } from '@/components/contract-document';
import { PrintButton } from '@/components/print-button';
import { loadPriceLists, loadVatRates } from '@/data/load';
import { differentPriceOn } from '@/domain/price-list';
import { vatPercentOn } from '@/domain/vat';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { getAsset } from '@/server/assets';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

/** Short, readable contract number from the id: the first 8 characters, upper case. */
const contractNumber = (id: string) => id.slice(0, 8).toUpperCase();

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/contracts/[id]'>): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  return { title: `${getT(locale)('contract.title')} ${contractNumber(id)}` };
}

export default async function ContractPage({ params }: PageProps<'/[locale]/contracts/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const contract = await getContract(db, id);
  if (!contract) notFound();
  const [asset, vatRates, priceLists] = await Promise.all([
    getAsset(db, contract.assetId),
    loadVatRates(),
    loadPriceLists(),
  ]);
  if (!asset) notFound();

  const t = getT(locale);
  const today = todayIso();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <p className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-900 ring-1 ring-emerald-200 ring-inset dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800">
          {t('contract.signedBanner')}
        </p>
        <PrintButton label={t('contract.print')} />
      </div>

      <ContractDocument
        view={{ ...contract, number: contractNumber(contract.id) }}
        asset={asset}
        vatPercentToday={vatPercentOn(vatRates, today)}
        todaysPrice={differentPriceOn(priceLists, asset.id, today, contract.listPriceCents)}
        locale={locale}
        t={t}
      />

      <Link
        href={`/${locale}`}
        className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 print:hidden"
      >
        <span aria-hidden="true">&larr;</span>
        {t('contract.toCatalogue')}
      </Link>
    </div>
  );
}
