// The catalogue: every asset with today's net list price, searchable, filterable and sortable.
// Filters come from the URL (?q=&category=&status=&sort=), so any view can be shared as a link.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetCard } from '@/components/asset-card';
import { CatalogueFilters } from '@/components/catalogue-filters';
import { loadPriceLists } from '@/data/load';
import { assetCategorySchema } from '@/data/schemas';
import { browseCatalogue, parseCatalogueQuery, type CatalogueItem } from '@/domain/catalogue';
import { formatIsoDate } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { isLocale, type Locale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export default async function CataloguePage({ params, searchParams }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const t = getT(locale);
  const today = todayIso(); // the page decides what "today" is; domain code never reads the clock
  const query = parseCatalogueQuery(await searchParams);
  const [assets, priceLists] = await Promise.all([listAssets(db), loadPriceLists()]);
  const items = browseCatalogue(assets, priceLists, today, query);

  // The default sort shows one section per category; any other sort is one flat list.
  const groups =
    query.sort === 'category'
      ? assetCategorySchema.options
          .map((category) => ({
            category,
            items: items.filter((item) => item.asset.category === category),
          }))
          .filter((group) => group.items.length > 0)
      : null;

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
      </div>

      <CatalogueFilters query={query} locale={locale} t={t} />

      <p role="status" className="mt-6 text-sm text-stone-600 dark:text-stone-400">
        {t('catalogue.resultCount', { count: items.length })}
      </p>

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {assets.length === 0 ? t('catalogue.empty') : t('catalogue.noMatches')}
        </p>
      ) : groups ? (
        groups.map((group) => (
          <section
            key={group.category}
            aria-labelledby={`category-${group.category}`}
            className="mt-10"
          >
            <div className="flex items-baseline justify-between gap-4 border-b border-stone-200 pb-3 dark:border-stone-800">
              <h2 id={`category-${group.category}`} className="text-xl font-semibold">
                {t(`category.${group.category}`)}
              </h2>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                {t('catalogue.itemCount', { count: group.items.length })}
              </p>
            </div>
            <AssetGrid items={group.items} locale={locale} t={t} />
          </section>
        ))
      ) : (
        <AssetGrid items={items} locale={locale} t={t} />
      )}
    </div>
  );
}

function AssetGrid({ items, locale, t }: { items: CatalogueItem[]; locale: Locale; t: Translate }) {
  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ asset, price }) => (
        <li key={asset.id}>
          <AssetCard asset={asset} price={price} locale={locale} t={t} />
        </li>
      ))}
    </ul>
  );
}
