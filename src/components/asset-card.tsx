// One catalogue item. A server component: it renders to HTML and ships no JavaScript.
import Link from 'next/link';
import type { Asset } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { invoiceAmounts } from '@/domain/lease-billing';
import type { ListPriceResult } from '@/domain/price-list';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { DemoItemId } from './demo-item-id';
import { ProductPhoto } from './product-photo';

type AssetCardProps = {
  asset: Asset;
  price: ListPriceResult;
  locale: Locale;
  t: Translate;
  vatBasisPoints: number | null;
  /** Demo mode: show the item's data-pack ID. */
  showId?: boolean;
};

export function AssetCard({ asset, price, locale, t, vatBasisPoints, showId }: AssetCardProps) {
  const headingId = `asset-${asset.id}`;
  const priceId = `${headingId}-price`;
  const detailId = `${headingId}-detail`;
  const detail =
    asset.status !== 'available'
      ? `${t('status.label')}: ${t(`status.${asset.status}`)}`
      : asset.condition !== 'new'
        ? `${t('condition.label')}: ${t(`condition.${asset.condition}`)}`
        : null;

  return (
    <article>
      <Link
        href={`/${locale}/products/${encodeURIComponent(asset.id)}`}
        aria-labelledby={headingId}
        aria-describedby={detail ? `${priceId} ${detailId}` : priceId}
        className="group block min-w-0 rounded-lg text-ink"
      >
        <ProductPhoto
          assetId={asset.id}
          productName={`${asset.make} ${asset.model}`}
          locale={locale}
          variant="catalogue"
          sizes="(min-width: 1069px) 280px, (min-width: 834px) 33vw, (min-width: 480px) 50vw, 100vw"
        />
        <h3
          id={headingId}
          className="mt-3 text-body wrap-anywhere group-hover:underline group-focus-visible:underline"
        >
          {asset.make} {asset.model}
        </h3>
        {showId ? (
          <p className="mt-1">
            <DemoItemId id={asset.id} label={t('demo.itemId')} />
          </p>
        ) : null}
        <p id={priceId} className="mt-1">
          <span className="block text-body font-semibold tabular-nums">
            {price.ok && vatBasisPoints !== null
              ? formatEuro(
                  invoiceAmounts(price.priceCents, vatBasisPoints).totalCents,
                  intlLocale[locale]
                )
              : t('asset.noPrice')}
          </span>
          <span className="block text-caption text-ink-muted">{t('pricing.listGross')}</span>
        </p>
        {detail ? (
          <p id={detailId} className="mt-1 text-caption text-ink-muted">
            {detail}
          </p>
        ) : null}
      </Link>
    </article>
  );
}
