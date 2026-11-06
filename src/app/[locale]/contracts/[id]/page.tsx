// A signed lease contract, ready to print or save as PDF. Every price on it was copied at
// signing; nothing here is recalculated from today's price lists. Below it (not printed): where
// the lease stands on the app's date, the return action at the end, and the monthly invoices.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ContractDocument } from '@/components/contract-document';
import { EndOfTermPanel } from '@/components/end-of-term-panel';
import { InvoiceList } from '@/components/invoice-list';
import { PrintButton } from '@/components/print-button';
import { loadCustomers } from '@/data/load';
import { effectivePriceLists } from '@/server/second-life';
import { effectiveVatRates } from '@/server/vat';
import { contractNumber, contractStage } from '@/domain/contract';
import { splitByDate } from '@/domain/invoicing';
import { contractInvoices } from '@/server/invoices';
import { handoverForContract } from '@/server/end-of-term';
import { formatEuro } from '@/domain/money';
import { differentPriceOn } from '@/domain/price-list';
import { vatPercentOn } from '@/domain/vat';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getAsset } from '@/server/assets';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';
import { currentViewer } from '@/server/current-viewer';
import { canSee } from '@/server/viewer';
import { NotYoursNotice } from '@/components/not-yours-notice';
import { appDate } from '@/server/app-date';

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
  // Demo login: only the customer it belongs to (or staff) sees it; see src/server/viewer.ts.
  if (!canSee(await currentViewer(), contract.customerId)) {
    const owner = (await loadCustomers()).find((c) => c.id === contract.customerId);
    return <NotYoursNotice ownerName={owner?.name ?? null} locale={locale} t={getT(locale)} />;
  }
  const [asset, vatRates, priceLists] = await Promise.all([
    getAsset(db, contract.assetId),
    effectiveVatRates(db),
    effectivePriceLists(db),
  ]);
  if (!asset) notFound();

  const t = getT(locale);
  const { today } = await appDate();
  const invoices = (await contractInvoices(db, contract, today)) ?? [];
  const handover =
    contract.status === 'passed_on' ? await handoverForContract(db, contract.id) : null;
  const passedTo = handover
    ? ((await loadCustomers()).find((c) => c.id === handover.toCustomerId)?.name ?? null)
    : null;

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

      {/* Not part of the printed contract: where the lease stands today, and its invoices. */}
      <EndOfTermPanel
        contractId={contract.id}
        assetId={contract.assetId}
        stage={contractStage(contract, today)}
        status={contract.status}
        startDate={contract.startDate}
        endDate={contract.endDate}
        returnedDate={contract.returnedDate}
        boughtDate={contract.boughtDate}
        boughtFor={
          contract.buyoutPaidCents === null
            ? null
            : formatEuro(contract.buyoutPaidCents, intlLocale[locale])
        }
        passedTo={passedTo}
        monthsIssued={splitByDate(invoices, today).issued.length}
        termMonths={contract.termMonths}
        locale={locale}
        t={t}
      />
      <InvoiceList
        invoices={invoices}
        contractId={contract.id}
        today={today}
        locale={locale}
        t={t}
      />

      <Link
        href={`/${locale}/contracts`}
        className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 print:hidden"
      >
        <span aria-hidden="true">&larr;</span>
        {t('contracts.backToList')}
      </Link>
    </div>
  );
}
