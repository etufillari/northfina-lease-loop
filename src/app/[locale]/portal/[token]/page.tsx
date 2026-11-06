import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CustomerEndOfTermActions } from '@/components/customer-end-of-term-actions';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getContractByAccessToken } from '@/server/customer-access';
import { db } from '@/server/db';
import { getInvoiceTimeline } from '@/server/invoices';
import { loadPricingData } from '@/server/pricing-data';

export default async function CustomerPortalPage({
  params,
}: PageProps<'/[locale]/portal/[token]'>) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();

  let contract;
  try {
    contract = await getContractByAccessToken(db, token);
  } catch {
    notFound();
  }
  const t = getT(locale);
  const timeline = await getInvoiceTimeline(db, await loadPricingData(), contract.id);
  const [buyoutRequest, returnRequest] = await Promise.all([
    db.buyoutRequest.findFirst({
      where: { contract_id: contract.id, status: { in: ['requested', 'approved'] } },
      orderBy: { created_at: 'desc' },
    }),
    db.returnRequest.findFirst({
      where: {
        contract_id: contract.id,
        status: { in: ['requested', 'received', 'inspected', 'planned', 'approved'] },
      },
      orderBy: { created_at: 'desc' },
    }),
  ]);
  const initialAction =
    buyoutRequest && returnRequest
      ? buyoutRequest.created_at >= returnRequest.created_at
        ? 'buyout'
        : 'return'
      : buyoutRequest
        ? 'buyout'
        : returnRequest
          ? 'return'
          : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
        {t('portal.step')}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        {t('portal.title')}
      </h1>
      <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">{t('portal.description')}</p>
      <section className="mt-8 rounded-2xl border border-stone-200 p-6 dark:border-stone-800">
        <h2 className="text-xl font-semibold">{t('portal.contractTitle')}</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Fact label={t('portal.status')} value={contract.status} />
          <Fact
            label={t('portal.monthlyRent')}
            value={formatEuro(contract.monthly_net_rent_cents, intlLocale[locale])}
          />
          <Fact label={t('portal.startDate')} value={formatIsoDate(contract.start_date, locale)} />
          <Fact label={t('portal.endDate')} value={formatIsoDate(contract.end_date, locale)} />
        </dl>
      </section>
      <section className="mt-8 rounded-2xl border border-stone-200 p-6 dark:border-stone-800">
        <h2 className="text-xl font-semibold">{t('portal.invoiceTitle')}</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Fact
            label={t('portal.totalGross')}
            value={formatEuro(timeline.totals.grossCents, intlLocale[locale])}
          />
          <Fact
            label={t('portal.issuedGross')}
            value={formatEuro(timeline.issuedTotals.grossCents, intlLocale[locale])}
          />
          <Fact label={t('portal.invoiceCount')} value={String(timeline.invoices.length)} />
        </dl>
        <ul className="mt-6 divide-y divide-stone-200 dark:divide-stone-800">
          {timeline.invoices.map((invoice) => (
            <li
              key={invoice.sequence}
              className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div>
                <p className="font-medium">
                  {invoice.kind === 'down_payment'
                    ? t('portal.downPayment')
                    : t('portal.rentInvoice', { sequence: invoice.sequence })}
                </p>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  {t(invoice.status === 'issued' ? 'portal.issued' : 'portal.forecast')} ·{' '}
                  {formatIsoDate(invoice.invoiceDate, locale)} · {t('portal.dueDate')}{' '}
                  {formatIsoDate(invoice.dueDate, locale)}
                </p>
              </div>
              <p className="font-medium tabular-nums">
                {formatEuro(invoice.grossCents, intlLocale[locale])}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <CustomerEndOfTermActions
        token={token}
        locale={locale}
        buyoutNetCents={contract.buyout_net_cents}
        initialAction={initialAction}
      />
      <Link
        href={`/${locale}`}
        className="mt-8 inline-flex rounded-xl border border-stone-300 px-5 py-3 font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
      >
        {t('contract.backToCatalogue')}
      </Link>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
