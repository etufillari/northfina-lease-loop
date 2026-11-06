// Browsing the catalogue: read the filters from the URL, price every asset on a date,
// then search, filter and sort. Pure: the page passes in the assets, price lists and today.
import {
  assetCategorySchema,
  assetStatusSchema,
  type Asset,
  type AssetCategory,
  type AssetStatus,
  type PriceList,
} from '@/data/schemas';
import { listPriceOn, type ListPriceResult } from './price-list';

export const catalogueSorts = ['category', 'price_asc', 'price_desc', 'newest', 'name'] as const;
export type CatalogueSort = (typeof catalogueSorts)[number];

/**
 * The statuses the catalogue can filter by. A sold item belongs to its buyer and has left the
 * loop, so the catalogue never shows it; the admin page keeps the tally (src/domain/sold.ts).
 */
export const catalogueStatuses = assetStatusSchema.options.filter(
  (status): status is Exclude<AssetStatus, 'sold'> => status !== 'sold'
);
export type CatalogueStatus = (typeof catalogueStatuses)[number];

export type CatalogueQuery = {
  /** Free text, trimmed. Empty means "no search". */
  search: string;
  /** `null` means every category. */
  category: AssetCategory | null;
  /** `null` means every status except sold. */
  status: CatalogueStatus | null;
  sort: CatalogueSort;
};

export const defaultCatalogueQuery: CatalogueQuery = {
  search: '',
  category: null,
  status: null,
  sort: 'category',
};

/** Longer searches are cut, so a pasted essay in the URL can't slow the page down. */
export const MAX_SEARCH_LENGTH = 100;

export type SearchParamsInput = Record<string, string | string[] | undefined>;

/**
 * Reads the catalogue filters from URL search params (`?q=&category=&status=&sort=`).
 * Unknown or malformed values fall back to the default instead of failing: a stale or
 * hand-edited link should still show the catalogue.
 */
export function parseCatalogueQuery(params: SearchParamsInput): CatalogueQuery {
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const category = assetCategorySchema.safeParse(first('category'));
  const status = first('status');
  const sort = first('sort');

  return {
    search: (first('q') ?? '').trim().slice(0, MAX_SEARCH_LENGTH),
    category: category.success ? category.data : null,
    status: catalogueStatuses.find((s) => s === status) ?? null,
    sort: catalogueSorts.find((s) => s === sort) ?? defaultCatalogueQuery.sort,
  };
}

/**
 * The query as a search string (`?category=e_bike&sort=price_asc`), leaving out defaults so
 * links stay short. Returns `''` when every filter is at its default.
 */
export function catalogueSearchString(query: CatalogueQuery): string {
  const params = new URLSearchParams();
  if (query.search) params.set('q', query.search);
  if (query.category) params.set('category', query.category);
  if (query.status) params.set('status', query.status);
  if (query.sort !== defaultCatalogueQuery.sort) params.set('sort', query.sort);
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Lower case, accents removed: "Nordvolt Trail 500" and "äÄ" compare the way people expect. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * True when every word of `search` appears in the asset's make, model, id, serial number or
 * model year. Words can come in any order: "500 nordvolt" finds the Nordvolt Trail 500.
 */
export function matchesSearch(asset: Asset, search: string): boolean {
  const words = normalize(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(
    [asset.make, asset.model, asset.id, asset.serial_number, String(asset.model_year)].join(' ')
  );
  return words.every((word) => haystack.includes(word));
}

export type CatalogueItem = { asset: Asset; price: ListPriceResult };

const categoryOrder = new Map(assetCategorySchema.options.map((c, index) => [c, index]));

/** Price for sorting. Items without a price on the date sort last in both directions. */
function sortablePrice(item: CatalogueItem, direction: 1 | -1): number {
  return item.price.ok ? item.price.priceCents * direction : Number.POSITIVE_INFINITY;
}

const comparators: Record<CatalogueSort, (a: CatalogueItem, b: CatalogueItem) => number> = {
  category: (a, b) =>
    (categoryOrder.get(a.asset.category) ?? 0) - (categoryOrder.get(b.asset.category) ?? 0),
  price_asc: (a, b) => sortablePrice(a, 1) - sortablePrice(b, 1),
  price_desc: (a, b) => sortablePrice(a, -1) - sortablePrice(b, -1),
  newest: (a, b) => b.asset.model_year - a.asset.model_year,
  name: (a, b) =>
    `${a.asset.make} ${a.asset.model}`.localeCompare(`${b.asset.make} ${b.asset.model}`, 'en'),
};

/**
 * Prices every asset on `isoDate` (`YYYY-MM-DD`), keeps those that match `query`, and sorts
 * them. Ties are broken by asset id, so the order never depends on the input order.
 */
export function browseCatalogue(
  assets: readonly Asset[],
  priceLists: readonly PriceList[],
  isoDate: string,
  query: CatalogueQuery
): CatalogueItem[] {
  const compare = comparators[query.sort];
  return (
    assets
      .filter((asset) => query.category === null || asset.category === query.category)
      // Never sold items (see catalogueStatuses). Reserved ones stay: the customer an item was
      // passed on to has to find it, and others may see it come free.
      .filter((asset) => asset.status !== 'sold')
      .filter((asset) => query.status === null || asset.status === query.status)
      .filter((asset) => matchesSearch(asset, query.search))
      .map((asset) => ({ asset, price: listPriceOn(priceLists, asset.id, isoDate) }))
      .sort((a, b) => compare(a, b) || a.asset.id.localeCompare(b.asset.id, 'en'))
  );
}
