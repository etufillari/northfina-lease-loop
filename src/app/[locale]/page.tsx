// The catalogue: every asset, grouped by category, with today's net list price.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetCard } from '@/components/asset-card';
import { assetCategorySchema } from '@/data/schemas';
import {
  CATALOGUE_QUERY_LIMIT,
  filterCatalogue,
  readCatalogueFilters,
} from '@/domain/catalogue-filter';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { cataloguePrices } from '@/server/spine-offers';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export default async function CataloguePage({ params, searchParams }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const filters = readCatalogueFilters(await searchParams);
  const t = getT(locale);
  const today = todayIso(); // the page decides what "today" is; domain code never reads the clock
  const [assets, offers] = await Promise.all([listAssets(db), cataloguePrices(db, today)]);
  const filteredAssets = filterCatalogue(assets, filters);
  const groups = assetCategorySchema.options
    .map((category) => ({
      category,
      assets: filteredAssets.filter((a) => a.category === category),
    }))
    .filter((group) => group.assets.length > 0);
  const hasFilters = filters.query !== '' || filters.category !== 'all' || filters.life !== 'all';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="catalogue-intro">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('catalogue.title')}
        </h1>
        <p className="catalogue-description">{t('catalogue.intro')}</p>
        <p className="catalogue-date">
          <time dateTime={today}>
            {t('catalogue.pricesOn', { date: formatIsoDate(today, locale) })}
          </time>
        </p>
      </div>

      <form
        key={JSON.stringify(filters)}
        action={'/' + locale}
        method="get"
        role="search"
        aria-label={t('catalogue.filterTitle')}
        className="ui-panel mt-8"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label htmlFor="catalogue-q" className="min-w-0">
            <span className="font-semibold">{t('catalogue.search')}</span>
            <input
              id="catalogue-q"
              name="q"
              type="search"
              defaultValue={filters.query}
              maxLength={CATALOGUE_QUERY_LIMIT}
              className="ui-input"
            />
          </label>
          <label htmlFor="catalogue-category" className="min-w-0">
            <span className="font-semibold">{t('catalogue.filterCategory')}</span>
            <select
              id="catalogue-category"
              name="category"
              defaultValue={filters.category}
              className="ui-input"
            >
              <option value="all">{t('catalogue.allCategories')}</option>
              {assetCategorySchema.options.map((category) => (
                <option key={category} value={category}>
                  {t(`category.${category}`)}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="catalogue-life" className="min-w-0">
            <span className="font-semibold">{t('catalogue.filterLife')}</span>
            <select
              id="catalogue-life"
              name="life"
              defaultValue={filters.life}
              className="ui-input"
            >
              <option value="all">{t('catalogue.life.all')}</option>
              <option value="first">{t('catalogue.life.first')}</option>
              <option value="later">{t('catalogue.life.later')}</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="submit" className="ui-button">
            {t('catalogue.searchSubmit')}
          </button>
          {hasFilters ? (
            <Link href={'/' + locale} className="ui-button ui-button--secondary">
              {t('catalogue.reset')}
            </Link>
          ) : null}
        </div>
      </form>

      {assets.length > 0 ? (
        <p className="ui-note mt-4">
          {t('catalogue.results', {
            count: formatNumber(filteredAssets.length, locale),
            total: formatNumber(assets.length, locale),
          })}
        </p>
      ) : null}

      {assets.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('catalogue.empty')}
        </p>
      ) : filteredAssets.length === 0 ? (
        <p className="ui-panel mt-6">{t('catalogue.noMatches')}</p>
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
                <AssetCard
                  asset={asset}
                  price={
                    offers[asset.id]
                      ? {
                          ok: true,
                          priceCents: offers[asset.id]!.priceCents,
                          priceListVersion: Number(offers[asset.id]!.source.split(':')[1]),
                        }
                      : { ok: false, reason: 'no_price_list_on_date' }
                  }
                  priceSource={offers[asset.id]?.source}
                  locale={locale}
                  t={t}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
