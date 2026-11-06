// Paging the catalogue: show a few items at a time (10 by default) instead of all of them,
// with a choice of how many per page. Kept apart from the filters (catalogue.ts): changing a
// filter starts again at page 1 but keeps the page size. Both live in the URL
// (?page=2&per=20), so a reload, a language switch or "Back to catalogue" lands on the same page.
import { catalogueSearchString, type CatalogueQuery, type SearchParamsInput } from './catalogue';

export const PER_PAGE_OPTIONS = [10, 20, 50] as const;
export const DEFAULT_PER_PAGE = 10;

export type CataloguePaging = { page: number; perPage: number };

export const defaultCataloguePaging: CataloguePaging = { page: 1, perPage: DEFAULT_PER_PAGE };

/**
 * Reads `page` and `per` from URL search params. A page size that isn't offered falls back to
 * the default; a page that isn't a whole number from 1 up falls back to page 1. A page past the
 * end is kept here and clamped by pageOf, which knows how many items there are.
 */
export function parseCataloguePaging(params: SearchParamsInput): CataloguePaging {
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const per = Number(first('per'));
  const page = Number(first('page'));
  return {
    page: Number.isSafeInteger(page) && page >= 1 ? page : 1,
    perPage: PER_PAGE_OPTIONS.find((option) => option === per) ?? DEFAULT_PER_PAGE,
  };
}

/** The filters and the paging as one search string, leaving out defaults: `?category=laptop&page=2`. */
export function catalogueSearch(query: CatalogueQuery, paging: CataloguePaging): string {
  const params = new URLSearchParams(catalogueSearchString(query));
  if (paging.page > 1) params.set('page', String(paging.page));
  if (paging.perPage !== DEFAULT_PER_PAGE) params.set('per', String(paging.perPage));
  const text = params.toString();
  return text ? `?${text}` : '';
}

export type CataloguePage<T> = {
  /** The items on this page. */
  items: T[];
  /** The page shown, between 1 and pageCount. */
  page: number;
  /** At least 1, so an empty result is "page 1 of 1". */
  pageCount: number;
  total: number;
  /** 1-based positions of the first and last item shown; both 0 when there are none. */
  from: number;
  to: number;
};

/** The items on the requested page. A page past the end shows the last page. */
export function pageOf<T>(items: readonly T[], paging: CataloguePaging): CataloguePage<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / paging.perPage));
  const page = Math.min(Math.max(1, paging.page), pageCount);
  const start = (page - 1) * paging.perPage;
  const shown = items.slice(start, start + paging.perPage);
  return {
    items: shown,
    page,
    pageCount,
    total,
    from: shown.length > 0 ? start + 1 : 0,
    to: start + shown.length,
  };
}

/**
 * The page numbers to link to: all of them when there are few, otherwise the first, the last
 * and the two either side of the current page, with 'gap' where numbers are left out.
 * For page 6 of 12: 1 … 4 5 6 7 8 … 12.
 */
export function pageLinks(page: number, pageCount: number): (number | 'gap')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const near = new Set([1, pageCount]);
  for (let n = page - 2; n <= page + 2; n++) if (n >= 1 && n <= pageCount) near.add(n);
  const sorted = [...near].sort((a, b) => a - b);
  const links: (number | 'gap')[] = [];
  sorted.forEach((n, i) => {
    const previous = sorted[i - 1];
    if (previous !== undefined && n - previous > 1) links.push('gap');
    links.push(n);
  });
  return links;
}
