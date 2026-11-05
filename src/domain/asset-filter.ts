import type { Asset, AssetCategory, AssetCondition, AssetStatus } from '@/data/schemas';

export type AssetFilters = {
  category?: AssetCategory;
  status?: AssetStatus;
  condition?: AssetCondition;
};

export function filterAssets(assets: readonly Asset[], filters: AssetFilters = {}): Asset[] {
  return assets.filter(
    (asset) =>
      (!filters.category || asset.category === filters.category) &&
      (!filters.status || asset.status === filters.status) &&
      (!filters.condition || asset.condition === filters.condition)
  );
}
