// One catalogue item. Plain markup with no state, rendered inside the CatalogueBrowser.
// The whole card is clickable: the title link stretches over it (see `after:inset-0`), which
// keeps a single, properly named link for keyboard and screen-reader users.
import Link from 'next/link';
import type { Asset } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import type { ListPriceResult } from '@/domain/price-list';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { StatusBadge } from './status-badge';

type AssetCardProps = {
  asset: Asset;
  price: ListPriceResult;
  locale: Locale;
  t: Translate;
  /** The catalogue's current filters (`?category=…`), passed on so the item page can link back. */
  catalogueSearch?: string;
};

export function AssetCard({ asset, price, locale, t, catalogueSearch = '' }: AssetCardProps) {
  const headingId = `asset-${asset.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="relative flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-emerald-600 hover:border-emerald-300 hover:shadow-md dark:border-stone-800 dark:bg-stone-900 dark:hover:border-emerald-800"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-stone-600 dark:text-stone-400">{asset.make}</p>
          <h3 id={headingId} className="text-lg leading-snug font-semibold">
            <Link
              href={`/${locale}/assets/${asset.id}${catalogueSearch}`}
              className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
            >
              {asset.model}
            </Link>
          </h3>
        </div>
        <StatusBadge status={asset.status} t={t} />
      </div>

      <dl className="mt-4 mb-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Fact label={t('condition.label')} value={t(`condition.${asset.condition}`)} />
        <Fact label={t('asset.modelYear')} value={String(asset.model_year)} />
        <Fact
          label={t('asset.usage')}
          value={t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) })}
        />
        <Fact label={t('asset.previousLives')} value={formatNumber(asset.previous_lives, locale)} />
      </dl>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-stone-100 pt-4 dark:border-stone-800">
        <div className="text-xs text-stone-600 dark:text-stone-400">
          <p>{t('asset.listPrice')}</p>
          {price.ok ? (
            <p>{t('asset.priceListVersion', { version: price.priceListVersion })}</p>
          ) : null}
        </div>
        <p className="text-right text-xl font-semibold tabular-nums">
          {price.ok ? formatEuro(price.priceCents, intlLocale[locale]) : t('asset.noPrice')}
        </p>
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
