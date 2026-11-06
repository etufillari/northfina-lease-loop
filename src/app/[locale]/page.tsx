// The catalogue: every asset, grouped by category, with today's net list price.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetCard } from '@/components/asset-card';
import { loadPriceLists } from '@/data/load';
import { assetCategorySchema } from '@/data/schemas';
import { listPriceOn } from '@/domain/price-list';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { asOfFromPage } from '@/server/as-of';
import { db } from '@/server/db';

export default async function CataloguePage({ params, searchParams }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const t = getT(locale);
  // The page decides what "today" is (the time-travel control or ?asOf=); domain code
  // never reads the clock.
  const { asOf: today, asOfParam } = await asOfFromPage(await searchParams);
  const [assets, priceLists] = await Promise.all([listAssets(db), loadPriceLists()]);
  const groups = assetCategorySchema.options
    .map((category) => ({ category, assets: assets.filter((a) => a.category === category) }))
    .filter((group) => group.assets.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('catalogue.title')}
        </h1>
        <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">{t('catalogue.intro')}</p>
        <p className="mt-5 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-900 ring-1 ring-emerald-200 ring-inset dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800">
          <time dateTime={today}>
            {t('catalogue.pricesOn', { date: formatIsoDate(today, locale) })}
          </time>
        </p>
        <p className="mt-3">
          <Link
            href={`/${locale}/fleet${asOfParam ? `?asOf=${asOfParam}` : ''}`}
            className="text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
          >
            {t('catalogue.fleetLink')}
          </Link>
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('catalogue.empty')}
        </p>
      ) : null}

      {groups.map((group) => (
        <section
          key={group.category}
          aria-labelledby={`category-${group.category}`}
          className="mt-12"
        >
          <div className="flex items-baseline justify-between gap-4 border-b border-stone-200 pb-3 dark:border-stone-800">
            <h2 id={`category-${group.category}`} className="text-xl font-semibold">
              {t(`category.${group.category}`)}
            </h2>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {t('catalogue.itemCount', { count: group.assets.length })}
            </p>
          </div>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.assets.map((asset) => (
              <li key={asset.id}>
                <Link
                  href={`/${locale}/assets/${asset.id}${asOfParam ? `?asOf=${asOfParam}` : ''}`}
                  className="block h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-emerald-700"
                >
                  <AssetCard
                    asset={asset}
                    price={listPriceOn(priceLists, asset.id, today)}
                    locale={locale}
                    t={t}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
