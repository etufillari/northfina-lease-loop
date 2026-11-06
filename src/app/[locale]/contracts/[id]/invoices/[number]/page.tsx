// One invoice, ready to print or save as PDF, with a link to pay it while it is due.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { InvoiceDocument } from '@/components/invoice-document';
import { NotYoursNotice } from '@/components/not-yours-notice';
import { PrintButton } from '@/components/print-button';
import { contractNumber } from '@/domain/contract';
import { invoiceLabel } from '@/domain/invoicing';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { loadInvoice } from '@/server/invoice-access';

type Props = PageProps<'/[locale]/contracts/[id]/invoices/[number]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id, number } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: `${getT(locale)('invoice.title')} ${invoiceLabel(contractNumber(id), Number(number))}`,
  };
}

export default async function InvoicePage({ params }: Props) {
  const { locale, id, number } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const access = await loadInvoice(id, number);
  if (access.kind === 'not_found') notFound();
  if (access.kind === 'not_yours') {
    return <NotYoursNotice ownerName={access.ownerName} locale={locale} t={t} />;
  }
  const { contract, invoice, asset } = access;
  const base = `/${locale}/contracts/${contract.id}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Link
          href={base}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
        >
          <span aria-hidden="true">&larr;</span>
          {t('invoice.backToContract')}
        </Link>
        <div className="flex flex-wrap gap-3">
          {invoice.status === 'due' ? (
            <Link
              href={`${base}/invoices/${invoice.number}/pay`}
              className="rounded-lg bg-amber-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-amber-700"
            >
              {t('invoice.payNow')}
            </Link>
          ) : null}
          <PrintButton label={t('contract.print')} />
        </div>
      </div>

      <InvoiceDocument
        label={invoiceLabel(contractNumber(contract.id), invoice.number)}
        contractLabel={contractNumber(contract.id)}
        invoice={invoice}
        termMonths={contract.termMonths}
        customerName={contract.customerName}
        customerEmail={contract.customerEmail}
        businessId={contract.businessId}
        asset={asset}
        locale={locale}
        t={t}
      />
    </div>
  );
}
