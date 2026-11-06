// The catalogue a customer browses: what can be leased today, one card per model rather than
// one per unit, then the returned and leased units greyed out at the bottom, narrowed by filters from the URL. A model's units differ only in their life
// (new, or used with its wear and year); identical units fold into one version that counts
// them, and the price page lets the customer pick a version. Pure: the caller passes each
// unit's monthly price (from pricing's financeOffer), so this never prices anything.
import { assetCategorySchema, type Asset, type AssetCategory } from '@/data/schemas';

/** One unit and its plain monthly price with VAT, or null when it has none (see the details). */
export type CatalogueEntry = { asset: Asset; monthlyCents: number | null };

/** Units of one model that a customer cannot tell apart: same life, condition, wear, year, price. */
export type ModelVersion = {
  key: string;
  /** The first unit, whose page the version links to. */
  asset: Asset;
  assetIds: string[];
  monthlyCents: number | null;
};

export type ModelGroup = {
  key: string;
  category: AssetCategory;
  make: string;
  model: string;
  /** New first, then by life, then by price. */
  versions: ModelVersion[];
  /** Units in the group. */
  count: number;
  hasNew: boolean;
  hasUsed: boolean;
  /** The range of the versions' monthly prices; null when no version has one. */
  minMonthlyCents: number | null;
  maxMonthlyCents: number | null;
};

export const conditionFilters = ['new', 'used', 'unavailable'] as const;
export type ConditionFilter = (typeof conditionFilters)[number];
export const catalogueSorts = ['price_asc', 'price_desc'] as const;
export type CatalogueSort = (typeof catalogueSorts)[number];
/** The sort without `?sort=`: lowest price first. There is no "recommended" order to rank by. */
export const DEFAULT_SORT: CatalogueSort = 'price_asc';

export type CatalogueFilters = {
  category: AssetCategory | null;
  condition: ConditionFilter | null;
  /** A brand; applies only inside a category, so it is dropped without one. */
  make: string | null;
  sort: CatalogueSort;
};

/**
 * Whether a customer sees the unit: only an available one can be quoted. Leased, reserved and
 * sold units belong to someone; a returned one waits to be assessed and re-priced (D12, D22).
 */
export function isListed(asset: Asset): boolean {
  return asset.status === 'available';
}

/**
 * The units shown at the bottom of the catalogue, greyed out, so their pages and passports
 * stay one click away: returned ones (they come back once second life re-prices them) before
 * leased ones. Reserved and sold units are not shown (D42).
 */
const UNAVAILABLE_ORDER = ['returned', 'leased'] as const;

export function isShownUnavailable(asset: Asset): boolean {
  return (UNAVAILABLE_ORDER as readonly string[]).includes(asset.status);
}

/** Used means it has had a lease before, whatever its condition ("like new" included). */
export function isUsed(asset: Asset): boolean {
  return asset.previous_lives > 0;
}

export function modelKey(asset: Pick<Asset, 'category' | 'make' | 'model'>): string {
  return `${asset.category}|${asset.make}|${asset.model}`;
}

function versionKey({ asset, monthlyCents }: CatalogueEntry): string {
  const { previous_lives, condition, usage, model_year } = asset;
  return [previous_lives, condition, usage.value, model_year, monthlyCents ?? '-'].join('|');
}

/** Nulls last, whichever way the numbers go. */
function compareNullable(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return (a - b) * direction;
}

function matches(entry: CatalogueEntry, filters: CatalogueFilters): boolean {
  const { asset } = entry;
  if (!isListed(asset)) return false;
  if (filters.category && asset.category !== filters.category) return false;
  if (filters.category && filters.make && asset.make !== filters.make) return false;
  if (filters.condition === 'unavailable') return false;
  if (filters.condition === 'new' && isUsed(asset)) return false;
  if (filters.condition === 'used' && !isUsed(asset)) return false;
  return true;
}

/** The listed units that pass the filters, stacked by model and sorted. */
export function buildCatalogue(entries: CatalogueEntry[], filters: CatalogueFilters): ModelGroup[] {
  const byModel = new Map<string, CatalogueEntry[]>();
  for (const entry of entries) {
    if (!matches(entry, filters)) continue;
    const key = modelKey(entry.asset);
    byModel.set(key, [...(byModel.get(key) ?? []), entry]);
  }

  const groups = [...byModel.entries()].map(([key, units]): ModelGroup => {
    const byVersion = new Map<string, ModelVersion>();
    for (const unit of units) {
      const vKey = versionKey(unit);
      const found = byVersion.get(vKey);
      if (found) found.assetIds.push(unit.asset.id);
      else
        byVersion.set(vKey, {
          key: vKey,
          asset: unit.asset,
          assetIds: [unit.asset.id],
          monthlyCents: unit.monthlyCents,
        });
    }
    const versions = [...byVersion.values()].sort(
      (a, b) =>
        a.asset.previous_lives - b.asset.previous_lives ||
        compareNullable(a.monthlyCents, b.monthlyCents, 1) ||
        a.asset.id.localeCompare(b.asset.id)
    );
    const prices = versions.flatMap((v) => (v.monthlyCents === null ? [] : [v.monthlyCents]));
    const first = units[0]!.asset;
    return {
      key,
      category: first.category,
      make: first.make,
      model: first.model,
      versions,
      count: units.length,
      hasNew: units.some((u) => !isUsed(u.asset)),
      hasUsed: units.some((u) => isUsed(u.asset)),
      minMonthlyCents: prices.length > 0 ? Math.min(...prices) : null,
      maxMonthlyCents: prices.length > 0 ? Math.max(...prices) : null,
    };
  });

  const direction = filters.sort === 'price_asc' ? 1 : -1;
  // A stable sort: models with the same lowest price keep the catalogue's order.
  return groups.sort((a, b) => compareNullable(a.minMonthlyCents, b.minMonthlyCents, direction));
}

/**
 * The versions of one unit's model a customer can choose between on its page: the model's
 * listed units, plus the unit itself even when it is not listed (a reserved one opened by its
 * link), so the page always finds itself in the list. Empty for an unknown id.
 */
export function modelVersions(entries: CatalogueEntry[], assetId: string): ModelVersion[] {
  const self = entries.find((e) => e.asset.id === assetId);
  if (!self) return [];
  const key = modelKey(self.asset);
  const units = entries
    .filter((e) => modelKey(e.asset) === key && (isListed(e.asset) || e.asset.id === assetId))
    .map((e) =>
      e.asset.id === assetId ? { ...e, asset: { ...e.asset, status: 'available' as const } } : e
    );
  const group = buildCatalogue(units, {
    category: null,
    condition: null,
    make: null,
    sort: DEFAULT_SORT,
  })[0];
  return (group?.versions ?? []).map((v) => ({
    ...v,
    asset: entries.find((e) => e.asset.id === v.asset.id)!.asset,
  }));
}

/**
 * The returned and leased units that pass the filters, one by one (not stacked), returned
 * first and then leased, each in the catalogue's order. Shown under "Any" and "Unavailable";
 * "New" and "Used" are about what can be leased, so they show none.
 */
export function unavailableUnits(entries: CatalogueEntry[], filters: CatalogueFilters): Asset[] {
  if (filters.condition === 'new' || filters.condition === 'used') return [];
  const shown = entries
    .map((e) => e.asset)
    .filter(
      (asset) =>
        isShownUnavailable(asset) &&
        (!filters.category || asset.category === filters.category) &&
        (!filters.category || !filters.make || asset.make === filters.make)
    );
  return UNAVAILABLE_ORDER.flatMap((status) => shown.filter((a) => a.status === status));
}

/** The brands a category shows (to lease, or greyed out), for its brand filter. */
export function brandsIn(entries: CatalogueEntry[], category: AssetCategory): string[] {
  const brands = entries
    .filter(
      (e) => (isListed(e.asset) || isShownUnavailable(e.asset)) && e.asset.category === category
    )
    .map((e) => e.asset.make);
  return [...new Set(brands)].sort((a, b) => a.localeCompare(b));
}

type SearchParams = Record<string, string | string[] | undefined>;

function one<T extends string>(value: SearchParams[string], allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/**
 * The filters in the URL (`?category=e_bike&condition=used&brand=Nordvolt&sort=price_asc`).
 * Anything unknown or repeated is ignored, and a brand without a category is dropped.
 */
export function parseCatalogueFilters(params: SearchParams): CatalogueFilters {
  const category = one(params.category, assetCategorySchema.options);
  const brand = params.brand;
  return {
    category,
    condition: one(params.condition, conditionFilters),
    make: category && typeof brand === 'string' && brand.trim() !== '' ? brand : null,
    sort: one(params.sort, catalogueSorts) ?? DEFAULT_SORT,
  };
}
