// The catalogue's left panel: which categories to browse and which filters apply. The filter lives
// in the URL (?category=…&condition=…&available=1), so the page needs no JavaScript and every
// view can be linked to. Unknown values are ignored, never an error.
import type { Asset } from '@/data/schemas';

/**
 * Categories a customer can browse, in panel order. The data pack has only e-bikes, laptops and
 * farm machines; the others are shown empty so the office range is visible before it is stocked.
 */
export const BROWSE_CATEGORIES = [
  'car',
  'office_equipment',
  'laptop',
  'monitor',
  'phone',
  'furniture',
  'e_bike',
  'farm_machine',
] as const;
export type BrowseCategory = (typeof BROWSE_CATEGORIES)[number];

export const CONDITION_FILTERS = ['new', 'second_life'] as const;
export type ConditionFilter = (typeof CONDITION_FILTERS)[number];

export type CatalogueFilter = {
  category: BrowseCategory | null;
  condition: ConditionFilter | null;
  availableOnly: boolean;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(options: readonly T[], value: string | undefined): T | null {
  return options.find((o) => o === value) ?? null;
}

export function parseCatalogueFilter(params: SearchParams): CatalogueFilter {
  return {
    category: oneOf(BROWSE_CATEGORIES, first(params.category)),
    condition: oneOf(CONDITION_FILTERS, first(params.condition)),
    availableOnly: first(params.available) === '1',
  };
}

/** New = no previous lease; second life = one or more. Available only = status `available`. */
export function filterCatalogue(assets: readonly Asset[], filter: CatalogueFilter): Asset[] {
  return assets.filter(
    (a) =>
      (filter.category === null || a.category === filter.category) &&
      (filter.condition === null ||
        (filter.condition === 'new' ? a.previous_lives === 0 : a.previous_lives > 0)) &&
      (!filter.availableOnly || a.status === 'available')
  );
}

export function countByCategory(assets: readonly Asset[]): Record<BrowseCategory, number> {
  const counts = Object.fromEntries(BROWSE_CATEGORIES.map((c) => [c, 0])) as Record<
    BrowseCategory,
    number
  >;
  for (const a of assets) counts[a.category] += 1;
  return counts;
}

/** The catalogue URL query for a filter, in a fixed order; empty when nothing is filtered. */
export function catalogueQuery(filter: CatalogueFilter): string {
  const params = new URLSearchParams();
  if (filter.category) params.set('category', filter.category);
  if (filter.condition) params.set('condition', filter.condition);
  if (filter.availableOnly) params.set('available', '1');
  const query = params.toString();
  return query ? `?${query}` : '';
}
