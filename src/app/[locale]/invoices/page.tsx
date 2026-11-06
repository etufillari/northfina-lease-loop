import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { InvoiceList } from '@/components/invoice-list';
import { loadAssets } from '@/data/load';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getActiveUser } from '@/server/active-user';
import { db } from '@/server/db';

export default async function InvoicesPage({ params }: PageProps<'/[locale]/invoices'>) {
  const { locale } = await params;
  if (!isLocale(locale) || process.env.NODE_ENV !== 'development') notFound();

  await connection();
  const t = getT(locale);
  const [customer, assets] = await Promise.all([getActiveUser(), loadAssets()]);
  const leases = customer
    ? await db.engineLease.findMany({
        where: { customerId: customer.id },
        include: { invoices: true },
        orderBy: { startDate: 'desc' },
      })
    : [];
  const invoices = leases
    .flatMap((lease) => {
      const asset = assets.find((item) => item.id === lease.assetId);
      return lease.invoices.map((invoice) => ({
        ...invoice,
        assetId: lease.assetId,
        assetName: asset ? `${asset.make} ${asset.model}` : lease.assetId,
      }));
    })
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-7">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('invoices.title')}</h1>
      <p className="mt-2 text-slate-600">{t('invoices.intro')}</p>
      {invoices.length > 0 ? (
        <InvoiceList
          invoices={invoices}
          locale={locale}
          currencyLocale={intlLocale[locale]}
          labels={{
            allItems: t('invoices.allItems'),
            selectItem: t('invoices.selectItem'),
            issued: t('invoices.issued'),
            due: t('invoices.due'),
            status: t('invoices.status.issued'),
          }}
        />
      ) : (
        <p className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          {t('invoices.empty')}
        </p>
      )}
    </div>
  );
}
