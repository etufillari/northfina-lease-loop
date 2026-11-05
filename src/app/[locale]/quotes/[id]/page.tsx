// A stored quote (D-034): the price the customer was shown, how long it holds, what today's
// price list would change (D-014), and the application that signs it.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ApplicationForm } from '@/components/application-form';
import { PriceCheckNotice, QuoteSummary } from '@/components/quote-summary';
import { answersFromCustomer } from '@/domain/persona';
import { getT, type MessageKey } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { asOfDate } from '@/server/as-of';
import { toAsset } from '@/server/assets';
import { db } from '@/server/db';
import { loadLeaseDataPack } from '@/server/lease-data';
import { viewQuote } from '@/server/quotes';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/quotes/[id]'>): Promise<Metadata> {
  const { locale, id } = await params;
  return isLocale(locale) ? { title: getT(locale)('quote.title', { id }) } : {};
}

export default async function QuotePage({ params }: PageProps<'/[locale]/quotes/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^\d+$/.test(id)) notFound();
  await connection();

  const today = await asOfDate();
  const data = await loadLeaseDataPack();
  const view = await viewQuote(db, data, Number(id), today);
  if (!view) notFound();
  const { quote, status, priceCheck } = view;
  const row = await db.asset.findUnique({ where: { id: quote.assetId } });
  const asset = row ? toAsset(row) : null;
  const t = getT(locale);
  let blocked: MessageKey | null = null;
  if (!asset) blocked = 'lease.notLeasable.no_price';
  else if (asset.status !== 'available') blocked = `lease.notLeasable.${asset.status}`;
  const offer =
    priceCheck?.kind === 'cheaper_today'
      ? {
          monthlyNetRentCents: priceCheck.requote.monthlyNetRentCents,
          savingPerMonthCents: priceCheck.savingPerMonthCents,
        }
      : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href={`/${locale}/assets/${quote.assetId}`}
        className="inline-flex items-center gap-2 rounded-full text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        <span aria-hidden="true">←</span> {t('quote.back')}
      </Link>
      <p className="mt-6 eyebrow">{asset ? `${asset.make} ${asset.model}` : quote.assetId}</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight uppercase sm:text-4xl">
        {t('quote.title', { id })}
      </h1>

      <div className="mt-8">
        <QuoteSummary
          locale={locale}
          quote={quote}
          status={status}
          contractId={view.contractId}
          vatRates={data.vatRates}
          today={today}
        />
      </div>
      {priceCheck ? <PriceCheckNotice locale={locale} quote={quote} check={priceCheck} /> : null}

      {status !== 'open' ? null : !asset || blocked !== null ? (
        // The item was leased by someone else since the quote, or is no longer leasable.
        <p className="mt-10 rounded-lg border border-dashed border-line p-6 text-muted">
          {t(blocked ?? 'lease.notLeasable.no_price')}
        </p>
      ) : (
        <ApplicationForm
          locale={locale}
          questions={data.questions}
          personas={data.customers.map((c) => ({
            id: c.id,
            name: c.name,
            answers: answersFromCustomer(c),
          }))}
          vatRates={data.vatRates}
          today={today}
          quoteId={view.id}
          deal={{
            category: asset.category,
            financedAmountCents: quote.financedCents,
            termMonths: quote.termMonths,
          }}
          monthlyNetRentCents={quote.monthlyNetRentCents}
          offer={offer}
        />
      )}
    </div>
  );
}
