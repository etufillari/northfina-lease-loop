// One item: choose a term and a down payment and see the monthly price update live.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { LeaseCalculator } from '@/components/lease-calculator';
import { assetCategorySchema } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getAsset } from '@/server/assets/assets';
import { db } from '@/server/db';
import { createLeaseOffer, type LeaseOfferResult } from '@/server/quotes/lease-offer';
import { todayIso } from '@/server/today';

function offerFailureMessage(
  offer: Extract<LeaseOfferResult, { ok: false }>,
  t: Translate
): string {
  if (offer.reason === 'asset_unavailable') return t('lease.unavailable');
  if (offer.reason === 'below_minimum') return t('lease.belowMinimum');
  return t('lease.noQuote');
}

export default async function AssetLeasePage({
  params,
}: PageProps<'/[locale]/catalogue/[category]/[assetId]'>) {
  const { locale, category: categoryParam, assetId } = await params;
  if (!isLocale(locale)) notFound();

  const categoryResult = assetCategorySchema.safeParse(categoryParam);
  if (!categoryResult.success) notFound();
  const category = categoryResult.data;

  // Render on every request: the offer depends on today's date and on the database.
  await connection();

  const asset = await getAsset(db, assetId);
  if (!asset || asset.category !== category) notFound();

  const t = getT(locale);
  const today = todayIso(); // the page decides what "today" is; domain code never reads the clock
  const offer = await createLeaseOffer(db, asset.id, today);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`/${locale}/catalogue/${category}`}
        className="text-sm font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300"
      >
        {t('lease.back', { category: t(`category.${category}`) })}
      </Link>

      <p className="mt-6 text-sm text-stone-600 dark:text-stone-400">{asset.make}</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{asset.model}</h1>

      {offer.ok ? (
        <>
          <p className="mt-5 mb-6 text-sm text-stone-600 dark:text-stone-400">
            {t('asset.listPrice')}:{' '}
            {formatEuro(offer.quote.pricing.netListPriceCents, intlLocale[locale])}
            {' · '}
            <time dateTime={today}>{formatIsoDate(today, locale)}</time>
          </p>
          <h2 className="mb-4 text-xl font-semibold">{t('lease.title')}</h2>
          <LeaseCalculator
            assetId={asset.id}
            date={today}
            limits={offer.limits}
            initialQuote={offer.quote}
            locale={locale}
            labels={{
              downPayment: t('catalogue.downPayment'),
              termLength: t('catalogue.termLength'),
              months: t('catalogue.months'),
              monthlyWithVat: t('lease.monthlyWithVat'),
              monthlyNet: t('lease.monthlyNet'),
              vat: t('lease.vat'),
              financed: t('lease.financed'),
              buyout: t('lease.buyout'),
              totalCost: t('lease.totalCost'),
              bandNote: t('lease.bandNote'),
              unavailable: t('lease.unavailable'),
              updateFailed: t('lease.updateFailed'),
            }}
          />
        </>
      ) : (
        <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {offerFailureMessage(offer, t)}
        </p>
      )}
    </div>
  );
}
