import { AssetCard } from '@/components/asset-card';
import type { Asset, PriceList } from '@/data/schemas';
import { listPriceOn } from '@/domain/pricing/price-list';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type CatalogueGridProps = {
  assets: Asset[];
  locale: Locale;
  priceLists: PriceList[];
  today: string;
  t: Translate;
};

export function CatalogueGrid({ assets, locale, priceLists, today, t }: CatalogueGridProps) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {assets.map((asset) => (
        <li key={asset.id}>
          <AssetCard
            asset={asset}
            price={listPriceOn(priceLists, asset.id, today)}
            locale={locale}
            t={t}
          />
        </li>
      ))}
    </ul>
  );
}
