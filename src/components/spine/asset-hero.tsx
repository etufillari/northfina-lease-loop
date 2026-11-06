import type { Asset } from '@/data/schemas';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { AssetArt } from '@/components/asset-art';

type Props = { asset: Asset | null | undefined; title: string; locale: Locale };

/** Product identity shared by customer and dealer workspaces; no workflow state here. */
export function AssetHero({ asset, title, locale }: Props) {
  const t = getT(locale);
  return (
    <div className="asset-hero">
      <div className="asset-hero-content">
        <p className="asset-hero-eyebrow">
          {asset ? t(`category.${asset.category}`) : t('spine.title')}
        </p>
        <h1 className="asset-hero-title">{title}</h1>
        {asset ? (
          <p className="asset-hero-detail">
            {t('asset.previousLives')}: {asset.previous_lives}
            <span aria-hidden="true"> · </span>
            {t('condition.label')}: {t(`condition.${asset.condition}`)}
          </p>
        ) : null}
      </div>
      {asset ? (
        <div className="asset-hero-art">
          <AssetArt category={asset.category} />
        </div>
      ) : null}
    </div>
  );
}
