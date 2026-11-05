// The catalogue: one tab per category, filterable by free text and list price, with today's
// net list price. The URL (?category=&q=&min=&max=) holds the whole view state.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetCard } from '@/components/asset-card';
import { CategoryTabs, FilterForm } from '@/components/catalogue-controls';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { assetCategorySchema, type AssetCategory } from '@/data/schemas';
import { filterCatalogue, parseCatalogueParams } from '@/domain/catalogue-filter';
import { listPriceOn } from '@/domain/price-list';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
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
  const [assets, priceLists, coefficientTable, vatRates] = await Promise.all([
    listAssets(db),
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);

  const categories = assetCategorySchema.options;
  const { filter, minText, maxText } = parseCatalogueParams(
    await searchParams,
    categories,
    'e_bike'
  );
  const items = assets.map((asset) => {
    const price = listPriceOn(priceLists, asset.id, today);
    return { asset, price, priceCents: price.ok ? price.priceCents : null };
  });
  const visible = filterCatalogue(items, filter);
  // Tab badges show how many items each category would hold with the current text and price.
  const counts = Object.fromEntries(
    categories.map((category) => [category, filterCatalogue(items, { ...filter, category }).length])
  ) as Record<AssetCategory, number>;
  const values = { q: filter.query, status: filter.status ?? '', min: minText, max: maxText };
  const badPrice =
    (minText !== '' && filter.minCents === null) || (maxText !== '' && filter.maxCents === null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Kept for screen readers and the document outline; the tabs below are the visible title. */}
      <h1 className="sr-only">{t('catalogue.title')}</h1>

      <div>
        <CategoryTabs
          categories={categories}
          active={filter.category}
          counts={counts}
          values={values}
          locale={locale}
          t={t}
        />
        <FilterForm category={filter.category} values={values} locale={locale} t={t} />
        {badPrice ? (
          <p role="status" className="mt-3 text-sm text-amber-800 dark:text-amber-300">
            {t('filter.priceInvalid')}
          </p>
        ) : null}
      </div>

      {assets.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('catalogue.empty')}
        </p>
      ) : (
        <section aria-labelledby="category-heading" className="mt-8">
          <h2 id="category-heading" className="sr-only">
            {t(`category.${filter.category}`)}
          </h2>
          <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-stone-600 dark:text-stone-400">
            <span aria-live="polite">{t('catalogue.itemCount', { count: visible.length })}</span>
            <time dateTime={today}>
              {t('catalogue.pricesOn', { date: formatIsoDate(today, locale) })}
            </time>
          </p>
          {visible.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
              {t('catalogue.noMatches')}
            </p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map(({ asset, price }) => (
                <li key={asset.id}>
                  <AssetCard
                    asset={asset}
                    price={price}
                    locale={locale}
                    t={t}
                    coefficientTable={coefficientTable}
                    vatRates={vatRates}
                    isoDate={today}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
