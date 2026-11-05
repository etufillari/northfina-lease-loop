'use client';

// The interactive catalogue: filters update the list instantly in the browser, with no page
// reload. The URL is kept in sync (history.replaceState), so any view can be shared as a link.
// The Search button still submits the form normally, which reloads the page with the same
// filters from the server, and that is also how it works without JavaScript.
import { useState } from 'react';
import type { Asset, PriceList } from '@/data/schemas';
import { browseCatalogue, catalogueSearchString, type CatalogueQuery } from '@/domain/catalogue';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { AssetCard } from './asset-card';
import { CatalogueFilters } from './catalogue-filters';

type CatalogueBrowserProps = {
  assets: Asset[];
  priceLists: PriceList[];
  /** Today as `YYYY-MM-DD`, chosen by the server so the browser and server agree on prices. */
  today: string;
  initialQuery: CatalogueQuery;
  locale: Locale;
};

export function CatalogueBrowser({
  assets,
  priceLists,
  today,
  initialQuery,
  locale,
}: CatalogueBrowserProps) {
  const t = getT(locale);
  const [query, setQuery] = useState(initialQuery);
  const items = browseCatalogue(assets, priceLists, today, query);

  function changeQuery(next: CatalogueQuery) {
    setQuery(next);
    window.history.replaceState(null, '', `/${locale}${catalogueSearchString(next)}`);
  }

  return (
    <>
      <CatalogueFilters query={query} onChange={changeQuery} locale={locale} t={t} />

      <p role="status" className="mt-6 text-sm text-stone-600 dark:text-stone-400">
        {t('catalogue.resultCount', { count: items.length })}
      </p>

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {assets.length === 0 ? t('catalogue.empty') : t('catalogue.noMatches')}
        </p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ asset, price }) => (
            <li key={asset.id}>
              <AssetCard
                asset={asset}
                price={price}
                locale={locale}
                t={t}
                catalogueSearch={catalogueSearchString(query)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
