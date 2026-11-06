import { AssetCard } from '@/components/asset-card';
import type { Asset, PriceList, ResidualCurves } from '@/data/schemas';
import { itemPriceOn } from '@/domain/pricing/item-price';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type CatalogueGridProps = {
  assets: Asset[];
  locale: Locale;
  priceLists: PriceList[];
  residualCurves: ResidualCurves;
  today: string;
  t: Translate;
};

export function CatalogueGrid({
  assets,
  locale,
  priceLists,
  residualCurves,
  today,
  t,
}: CatalogueGridProps) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {assets.map((asset) => (
        <li key={asset.id}>
          <AssetCard
            asset={asset}
            price={itemPriceOn(asset, priceLists, residualCurves, today)}
            locale={locale}
            t={t}
          />
        </li>
      ))}
    </ul>
  );
}
