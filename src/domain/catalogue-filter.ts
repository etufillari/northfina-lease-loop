// Catalogue filtering: pick one category, then narrow by free text and by list price.
// Pure: prices are passed in (integer euro cents), nothing is read from the clock or database.
import type { Asset, AssetCategory } from '@/data/schemas';
import { parseEuroToCents } from './money';

export type CatalogueItem = {
  asset: Asset;
  /** Net list price in cents, or null when the asset has no price on the day. */
  priceCents: number | null;
};

export type CatalogueFilter = {
  category: AssetCategory;
  /** Free text. Every word must appear in the make, model, model year or serial number. */
  query: string;
  /** Inclusive bounds on the list price, in cents. null = no bound. */
  minCents: number | null;
  maxCents: number | null;
};

/** Lower-cases and strips accents so "Sähkö" matches "sahko". */
function normalise(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en');
}

function matchesQuery(asset: Asset, query: string): boolean {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalise(
    `${asset.make} ${asset.model} ${asset.model_year} ${asset.serial_number}`
  );
  return words.every((word) => haystack.includes(word));
}

/**
 * Keeps the items of the chosen category that match the text and the price range.
 * An item with no price never passes a price bound: we cannot say it is within the range.
 */
export function filterCatalogue<T extends CatalogueItem>(
  items: readonly T[],
  filter: CatalogueFilter
): T[] {
  const { category, query, minCents, maxCents } = filter;
  return items.filter(({ asset, priceCents }) => {
    if (asset.category !== category) return false;
    if (!matchesQuery(asset, query)) return false;
    if (minCents !== null || maxCents !== null) {
      if (priceCents === null) return false;
      if (minCents !== null && priceCents < minCents) return false;
      if (maxCents !== null && priceCents > maxCents) return false;
    }
    return true;
  });
}

type RawParam = string | string[] | undefined;

function first(value: RawParam): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** Longest search text we accept from the URL. */
const MAX_QUERY_LENGTH = 100;

export type ParsedCatalogueParams = {
  filter: CatalogueFilter;
  /** The min/max text as typed, to put back in the form. */
  minText: string;
  maxText: string;
};

/**
 * Reads `?category=&q=&min=&max=` from the URL. Never throws: an unknown category falls back to
 * `defaultCategory`, and a price that is not an amount is ignored (no bound).
 */
export function parseCatalogueParams(
  params: Record<string, RawParam>,
  categories: readonly AssetCategory[],
  defaultCategory: AssetCategory
): ParsedCatalogueParams {
  const rawCategory = first(params.category);
  const category = categories.find((c) => c === rawCategory) ?? defaultCategory;
  const minText = first(params.min).trim();
  const maxText = first(params.max).trim();
  return {
    filter: {
      category,
      query: first(params.q).trim().slice(0, MAX_QUERY_LENGTH),
      minCents: minText === '' ? null : parseEuroToCents(minText),
      maxCents: maxText === '' ? null : parseEuroToCents(maxText),
    },
    minText,
    maxText,
  };
}
