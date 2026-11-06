// The catalogue: a left panel of categories and filters, the banner, then every matching asset,
// grouped by category, with today's net list price. The filter lives in the URL.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetCard } from '@/components/asset-card';
import { CatalogueHero } from '@/components/catalogue-hero';
import { CatalogueSidebar } from '@/components/catalogue-sidebar';
import { SwipeRow } from '@/components/ui/swipe-row';
import { loadPriceLists } from '@/data/load';
import {
  BROWSE_CATEGORIES,
  countByCategory,
  filterCatalogue,
  parseCatalogueFilter,
} from '@/domain/catalogue-filter';
import { listPriceOn } from '@/domain/price-list';
import { withListedPrices } from '@/domain/second-life';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { asOfDate } from '@/server/as-of';
import { listedPrices } from '@/server/listed-prices';

export default async function CataloguePage({ params, searchParams }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const t = getT(locale);
  const filter = parseCatalogueFilter(await searchParams);
  const today = await asOfDate(); // the demo date or the real one (D-030); domain code never reads the clock
  const [assets, dataPriceLists] = await Promise.all([listAssets(db), loadPriceLists()]);
  // Re-listed items show their second-life price, not the new-item price (D-035).
  const listed = await listedPrices(db);
  const priceLists = withListedPrices(dataPriceLists, listed);

  const shown = filterCatalogue(assets, filter);
  const groups = BROWSE_CATEGORIES.map((category) => ({
    category,
    assets: shown.filter((a) => a.category === category),
  })).filter((group) => group.assets.length > 0);

  let emptyNote: string | null = null;
  if (assets.length === 0) emptyNote = t('catalogue.empty');
  else if (
    groups.length === 0 &&
    filter.category !== null &&
    !filter.condition &&
    !filter.availableOnly
  )
    emptyNote = t('catalogue.categoryEmpty', { category: t(`category.${filter.category}`) });
  else if (groups.length === 0) emptyNote = t('catalogue.noMatches');

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
      <aside className="lg:row-span-2">
        <CatalogueSidebar
          filter={filter}
          counts={countByCategory(assets)}
          total={assets.length}
          locale={locale}
          t={t}
        />
      </aside>

      <div className="flex min-w-0 flex-col gap-12 sm:gap-14">
        <CatalogueHero t={t} />

        {emptyNote ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-muted">{emptyNote}</p>
        ) : null}

        {groups.map((group) => {
          const title = t(`category.${group.category}`);
          return (
            <SwipeRow
              key={group.category}
              headingId={`category-${group.category}`}
              title={title}
              subtitle={t('catalogue.itemCount', { count: group.assets.length })}
              previousLabel={t('catalogue.scrollBack', { category: title })}
              nextLabel={t('catalogue.scrollForward', { category: title })}
            >
              {group.assets.map((asset) => (
                <li key={asset.id} className="snap-start">
                  <AssetCard
                    asset={asset}
                    price={listPriceOn(priceLists, asset.id, today)}
                    secondLifePrice={asset.id in listed}
                    locale={locale}
                    t={t}
                  />
                </li>
              ))}
            </SwipeRow>
          );
        })}
      </div>
    </div>
  );
}
