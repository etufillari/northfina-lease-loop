// Demo payment page. It says plainly that no money moves: taking real payments safely (bank
// details, card data, fraud checks) is out of scope for this app, so we don't ask for any.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { NotYoursNotice } from '@/components/not-yours-notice';
import { PayInvoiceButton } from '@/components/pay-invoice-button';
import { contractNumber } from '@/domain/contract';
import { invoiceLabel } from '@/domain/invoicing';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { loadInvoice } from '@/server/invoice-access';

export default async function PayInvoicePage({
  params,
}: PageProps<'/[locale]/contracts/[id]/invoices/[number]/pay'>) {
  const { locale, id, number } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const access = await loadInvoice(id, number);
  if (access.kind === 'not_found') notFound();
  if (access.kind === 'not_yours') {
    return <NotYoursNotice ownerName={access.ownerName} locale={locale} t={t} />;
  }
  const { contract, invoice } = access;
  const invoiceHref = `/${locale}/contracts/${contract.id}/invoices/${invoice.number}`;
  if (invoice.status === 'paid') redirect(invoiceHref);

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={invoiceHref}
        className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
      >
        <span aria-hidden="true">&larr;</span>
        {t('invoice.backToInvoice')}
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{t('pay.title')}</h1>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {t('invoice.number')}{' '}
          <span className="font-mono">
            {invoiceLabel(contractNumber(contract.id), invoice.number)}
          </span>
        </p>
        <p className="mt-2 text-4xl font-semibold tabular-nums">
          {formatEuro(invoice.totalCents, intlLocale[locale])}
        </p>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {t('pay.due', { date: formatIsoDate(invoice.dueDate, locale) })}
        </p>
        <div className="mt-6">
          <PayInvoiceButton
            contractId={contract.id}
            invoiceNumber={invoice.number}
            actor={contract.signerName}
            doneHref={invoiceHref}
            label={t('pay.button')}
            sendingLabel={t('pay.sending')}
            failedLabel={t('pay.failed')}
          />
        </div>
      </section>

      <section
        aria-labelledby="demo-note"
        className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
      >
        <h2 id="demo-note" className="font-semibold">
          {t('pay.demoTitle')}
        </h2>
        <p className="mt-2 text-sm">{t('pay.demoText')}</p>
      </section>
    </div>
  );
}
