// One catalogue item: a picture tile with status and life, then make, model and price. The whole
// card is one link (the heading's link stretches over it). A server component: it ships no JavaScript.
import Link from 'next/link';
import type { Asset } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import type { ListPriceResult } from '@/domain/price-list';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { CategoryArt } from './ui/category-art';
import { LivesMeter } from './ui/lives-meter';
import { StatusBadge } from './ui/status-badge';

type AssetCardProps = {
  asset: Asset;
  price: ListPriceResult;
  /** The price is a re-listed item's second-life price (D-035). */
  secondLifePrice?: boolean;
  locale: Locale;
  t: Translate;
};

export function AssetCard({ asset, price, secondLifePrice, locale, t }: AssetCardProps) {
  const headingId = `asset-${asset.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="group relative flex h-full flex-col rounded-lg transition-transform duration-300 ease-out hover:-translate-y-1 has-focus-visible:-translate-y-1"
    >
      <CategoryArt
        asset={asset}
        className="aspect-[4/5] rounded-md ring-accent ring-offset-4 ring-offset-bg transition-shadow group-hover:ring-2"
      >
        <div className="absolute inset-x-2.5 top-2.5 flex flex-wrap justify-between gap-1.5">
          <StatusBadge status={asset.status} t={t} />
          <LivesMeter previousLives={asset.previous_lives} t={t} />
        </div>
      </CategoryArt>

      <div className="flex flex-1 flex-col gap-1 px-0.5 pt-3">
        <p className="eyebrow">{asset.make}</p>
        <h3 id={headingId} className="font-display text-base leading-snug font-bold tracking-tight">
          <Link
            href={`/${locale}/assets/${asset.id}`}
            className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none after:focus-visible:outline-2 after:focus-visible:outline-offset-4 after:focus-visible:outline-accent"
          >
            {asset.model}
            <span className="sr-only">, {t('asset.lease')}</span>
          </Link>
        </h3>
        <p className="text-sm text-muted">
          {asset.model_year} · {t(`condition.${asset.condition}`)} ·{' '}
          {t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) })}
        </p>
        <div className="mt-auto flex items-baseline justify-between gap-3 pt-3">
          <p className="text-xs text-muted">
            {t(secondLifePrice ? 'asset.secondLifePrice' : 'asset.listPrice')}
          </p>
          <p className="font-display text-base font-bold tabular-nums">
            {/* A returned item's new-item price is not its price; it is re-priced first. */}
            {asset.status === 'returned'
              ? t('asset.beingRefurbished')
              : price.ok
                ? formatEuro(price.priceCents, intlLocale[locale])
                : t('asset.noPrice')}
          </p>
        </div>
      </div>
    </article>
  );
}
