// One catalogue item: what it is, what it costs today, and whether it can be leased.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetFacts } from '@/components/asset-facts';
import { LeaseUnavailable } from '@/components/lease-unavailable';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { listPriceOn } from '@/domain/price-list';
import { leaseOffer } from '@/domain/quote-options';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getAsset } from '@/server/assets';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export default async function AssetPricePage({ params }: PageProps<'/[locale]/assets/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: the price depends on today's date and on the database.
  await connection();

  const asset = await getAsset(db, id);
  if (!asset) notFound();

  const t = getT(locale);
  const today = todayIso();
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const [priceLists, table] = await Promise.all([loadPriceLists(), loadCoefficientTable()]);
  const price = listPriceOn(priceLists, asset.id, today);
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
        <p className="mt-6 text-stone-700 dark:text-stone-300">
          {t('price.downRange', {
            min: euro(offer.range.minCents),
            max: euro(offer.range.maxCents),
          })}
        </p>
      ) : (
        <LeaseUnavailable
          reason={offer.reason}
          minimum={euro(Math.min(...table.bands.map((band) => band.min_financed_cents)))}
          t={t}
        />
      )}
    </div>
  );
}
