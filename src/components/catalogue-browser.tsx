'use client';

// The interactive catalogue: filters update the list instantly in the browser, with no page
// reload. The URL is kept in sync (history.replaceState), so any view can be shared as a link.
// The Search button still submits the form normally, which reloads the page with the same
// filters from the server, and that is also how it works without JavaScript.
// The list shows one page at a time (10 items by default, see catalogue-pages.ts); changing a
// filter goes back to page 1, and changing the page size keeps the first item shown in view.
import { useRef, useState } from 'react';
import type { Asset, PriceList } from '@/data/schemas';
import { browseCatalogue, type CatalogueQuery } from '@/domain/catalogue';
import { catalogueSearch, pageOf, type CataloguePaging } from '@/domain/catalogue-pages';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { AssetCard } from './asset-card';
import { CatalogueFilters } from './catalogue-filters';
import { PageNav, PerPageSelect } from './catalogue-pager';
import { CategoryTabs } from './category-tabs';

type CatalogueBrowserProps = {
  assets: Asset[];
  priceLists: PriceList[];
  /** Today as `YYYY-MM-DD`, chosen by the server so the browser and server agree on prices. */
  today: string;
  initialQuery: CatalogueQuery;
  initialPaging: CataloguePaging;
  locale: Locale;
};

export function CatalogueBrowser({
  assets,
  priceLists,
  today,
  initialQuery,
  initialPaging,
  locale,
}: CatalogueBrowserProps) {
  const t = getT(locale);
  const [query, setQuery] = useState(initialQuery);
  const [paging, setPaging] = useState(initialPaging);
  const results = useRef<HTMLParagraphElement>(null);
  const items = browseCatalogue(assets, priceLists, today, query);
  const anyCategory = browseCatalogue(assets, priceLists, today, { ...query, category: null });
  const shown = pageOf(items, paging);

  const href = (nextQuery: CatalogueQuery, nextPaging: CataloguePaging) =>
    `/${locale}/catalogue${catalogueSearch(nextQuery, nextPaging)}`;

  function show(nextQuery: CatalogueQuery, nextPaging: CataloguePaging) {
    setQuery(nextQuery);
    setPaging(nextPaging);
    window.history.replaceState(null, '', href(nextQuery, nextPaging));
  }

  // A new filter starts again at page 1; the page size stays.
  const changeQuery = (next: CatalogueQuery) => show(next, { ...paging, page: 1 });

  // On a new page, go back up to the results and put the focus there, so a keyboard or
  // screen-reader user continues from the first item instead of the bottom of the page.
  function changePage({ page }: { page: number }) {
    show(query, { ...paging, page });
    results.current?.focus({ preventScroll: true });
    results.current?.scrollIntoView({ block: 'start' });
  }

  // Keep the first item shown on the new page: item 21 of 10-per-page (page 3) is on page 2
  // with 20 per page.
  const changePerPage = (perPage: number) =>
    show(query, { perPage, page: Math.floor((Math.max(1, shown.from) - 1) / perPage) + 1 });

  const pageSearch = catalogueSearch(query, { ...paging, page: shown.page });

  return (
    <>
      <CatalogueFilters
        query={query}
        perPage={paging.perPage}
        onChange={changeQuery}
        locale={locale}
        t={t}
      />

      <CategoryTabs
        query={query}
        matching={anyCategory.map((item) => item.asset)}
        hrefFor={(next) => href(next, { ...paging, page: 1 })}
        onChange={changeQuery}
        t={t}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p
          ref={results}
          tabIndex={-1}
          role="status"
          className="scroll-mt-4 text-sm text-stone-600 focus:outline-none dark:text-stone-400"
        >
          {shown.total === 0
            ? t('catalogue.resultCount', { count: 0 })
            : t('catalogue.showing', { from: shown.from, to: shown.to, count: shown.total })}
        </p>
        {shown.total > 0 ? (
          <PerPageSelect perPage={paging.perPage} onChange={changePerPage} t={t} />
        ) : null}
      </div>

      {shown.total === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {assets.length === 0 ? t('catalogue.empty') : t('catalogue.noMatches')}
        </p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.items.map(({ asset, price }) => (
            <li key={asset.id}>
              <AssetCard
                asset={asset}
                price={price}
                locale={locale}
                t={t}
                catalogueSearch={pageSearch}
              />
            </li>
          ))}
        </ul>
      )}

      <PageNav
        page={shown.page}
        pageCount={shown.pageCount}
        hrefFor={(page) => href(query, { ...paging, page })}
        onChange={changePage}
        t={t}
      />
    </>
  );
}
