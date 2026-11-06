import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { getActiveUser } from '@/server/active-user';
import { db } from '@/server/db';

export default async function InvoicePage({ params }: PageProps<'/[locale]/invoices/[invoiceId]'>) {
  const { locale, invoiceId } = await params;
  if (!isLocale(locale) || process.env.NODE_ENV !== 'development') notFound();

  await connection();
  const t = getT(locale);
  const customer = await getActiveUser();
  const invoice = customer
    ? await db.engineInvoice.findFirst({
        where: { id: invoiceId, lease: { customerId: customer.id } },
      })
    : null;
  if (!invoice) notFound();

  const pdfUrl = `/api/invoices/${invoice.id}?format=pdf`;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{invoice.number}</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">{t('invoices.viewerIntro')}</p>
        </div>
        <a
          href={pdfUrl}
          download={`${invoice.number}.pdf`}
          className="rounded-lg bg-[#101d46] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b2c61]"
        >
          {t('invoices.download')}
        </a>
      </div>
      <iframe
        title={t('invoices.viewerTitle')}
        src={pdfUrl}
        className="mt-8 h-[70vh] min-h-[34rem] w-full rounded-2xl border border-slate-200 bg-white shadow-sm"
      />
      <Link
        href={`/${locale}/invoices`}
        className="mt-4 inline-block text-sm font-semibold text-[#101d46] dark:text-emerald-300"
      >
        {t('invoices.back')}
      </Link>
    </div>
  );
}
