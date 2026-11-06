// One catalogue item: what it is, what it costs today, and the sliders to price a lease.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetFacts } from '@/components/asset-facts';
import { LeaseUnavailable } from '@/components/lease-unavailable';
import { PricingDate } from '@/components/pricing-date';
import { PriceSliders } from '@/components/price-sliders';
import { WishlistRequest } from '@/components/wishlist-request';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { isoDateSchema } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { listPriceOn } from '@/domain/price-list';
import { initialSelection, leaseOffer } from '@/domain/quote-options';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getAsset } from '@/server/assets';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/assets/[id]'>): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)('price.metaTitle') } : {};
}

export default async function AssetPricePage({
  params,
  searchParams,
}: PageProps<'/[locale]/assets/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: the price depends on today's date and on the database.
  await connection();

  const asset = await getAsset(db, id);
  if (!asset) notFound();

  const t = getT(locale);
  const today = todayIso();
  const query = await searchParams;
  // `on` replays another day, as the scenario cards do. A bad date in the URL means today.
  const onDate = isoDateSchema.safeParse(query.on).data ?? today;
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const [priceLists, table, vatRates] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  const price = listPriceOn(priceLists, asset.id, onDate);
  const offer = leaseOffer(table, asset.status, price);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`/${locale}`}
        className="text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
      >
        {t('price.back')}
      </Link>

      <header className="mt-4">
        <p className="text-stone-600 dark:text-stone-400">{asset.make}</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{asset.model}</h1>
      </header>

      <PricingDate
        onDate={onDate}
        today={today}
        earliest={priceLists.map((list) => list.valid_from).sort()[0] ?? today}
        locale={locale}
      />

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <AssetFacts asset={asset} locale={locale} t={t} />
        <div className="mt-5 flex items-end justify-between gap-3 border-t border-stone-100 pt-4 dark:border-stone-800">
          <div className="text-xs text-stone-600 dark:text-stone-400">
            <p>{t('asset.listPrice')}</p>
            {price.ok ? (
              <p>{t('asset.priceListVersion', { version: price.priceListVersion })}</p>
            ) : null}
          </div>
          <p className="text-right text-xl font-semibold tabular-nums">
            {price.ok ? euro(price.priceCents) : t('asset.noPrice')}
          </p>
        </div>
      </section>

      {offer.ok ? (
        <PriceSliders
          key={onDate}
          assetId={asset.id}
          category={asset.category}
          onDate={onDate}
          initial={initialSelection(table, offer.range, query)}
          offer={offer}
          table={table}
          vatRates={vatRates}
          locale={locale}
        />
      ) : (
        <>
          <LeaseUnavailable
            reason={offer.reason}
            minimum={euro(Math.min(...table.bands.map((band) => band.min_financed_cents)))}
            t={t}
          />
          {asset.status === 'reserved' ? (
            <WishlistRequest assetId={asset.id} locale={locale} today={today} />
          ) : null}
        </>
      )}
    </div>
  );
}
