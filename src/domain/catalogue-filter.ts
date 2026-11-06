import { assetCategorySchema, type Asset, type AssetCategory } from '@/data/schemas';

export const CATALOGUE_QUERY_LIMIT = 60;

export type CatalogueFilters = {
  query: string;
  category: AssetCategory | 'all';
  life: 'all' | 'first' | 'later';
};

/** Keep the entered case for display; ignore invalid or repeated filter values. */
export function readCatalogueFilters(
  params: Record<string, string | string[] | undefined>
): CatalogueFilters {
  const category = assetCategorySchema.safeParse(params.category);
  return {
    query: typeof params.q === 'string' ? params.q.trim().slice(0, CATALOGUE_QUERY_LIMIT) : '',
    category: category.success ? category.data : 'all',
    life: params.life === 'first' || params.life === 'later' ? params.life : 'all',
  };
}

/** Lease history comes from completed lives, independently of condition or availability. */
export function filterCatalogue(assets: readonly Asset[], filters: CatalogueFilters): Asset[] {
  const query = filters.query.trim().toLowerCase();
  return assets.filter((asset) => {
    if (filters.category !== 'all' && asset.category !== filters.category) return false;
    if (filters.life === 'first' && asset.previous_lives !== 0) return false;
    if (filters.life === 'later' && asset.previous_lives < 1) return false;
    return [asset.make, asset.model, asset.id].join(' ').toLowerCase().includes(query);
  });
}
