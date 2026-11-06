// One catalogue item. A server component: it renders to HTML and ships no JavaScript.
import Link from 'next/link';
import { AssetArt } from '@/components/asset-art';
import type { Asset, AssetStatus } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import type { ListPriceResult } from '@/domain/price-list';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

const statusStyles: Record<AssetStatus, { badge: string; dot: string }> = {
  available: {
    badge:
      'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
    dot: 'bg-emerald-600 dark:bg-emerald-400',
  },
  reserved: {
    badge:
      'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
    dot: 'bg-amber-500 dark:bg-amber-400',
  },
  returned: {
    badge:
      'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800',
    dot: 'bg-sky-600 dark:bg-sky-400',
  },
};

type AssetCardProps = {
  asset: Asset;
  price: ListPriceResult;
  locale: Locale;
  t: Translate;
  priceSource?: string;
};

export function AssetCard({ asset, price, locale, t, priceSource }: AssetCardProps) {
  const headingId = `asset-${asset.id}`;
  const status = statusStyles[asset.status];

  return (
    <article aria-labelledby={headingId} className="catalogue-card">
      <div className="catalogue-visual" data-category={asset.category}>
        <span className="catalogue-category">{t(`category.${asset.category}`)}</span>
        <AssetArt category={asset.category} />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-36">
          <p className="ui-note">{asset.make}</p>
          <h3 id={headingId} className="mt-1 text-xl leading-snug font-semibold">
            {asset.model}
          </h3>
        </div>
        <p
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ring-1 ring-inset ${status.badge}`}
        >
          <span aria-hidden="true" className={`size-1.5 rounded-full ${status.dot}`} />
          <span className="sr-only">{t('status.label')}: </span>
          {t(`status.${asset.status}`)}
        </p>
      </div>

      <dl className="mt-5 mb-6 grid grid-cols-2 gap-x-4 gap-y-4">
        <Fact label={t('condition.label')} value={t(`condition.${asset.condition}`)} />
        <Fact label={t('asset.modelYear')} value={String(asset.model_year)} />
        <Fact
          label={t('asset.usage')}
          value={t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) })}
        />
        <Fact label={t('asset.previousLives')} value={formatNumber(asset.previous_lives, locale)} />
      </dl>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-stone-200 pt-4 dark:border-stone-700">
        <div className="ui-note">
          <p>{t('asset.listPrice')}</p>
          {price.ok ? (
            <p>
              {priceSource?.startsWith('release:')
                ? t('spine.releasePrice', { version: priceSource.split(':')[1] ?? '' })
                : t('asset.priceListVersion', { version: price.priceListVersion })}
            </p>
          ) : null}
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {price.ok ? formatEuro(price.priceCents, intlLocale[locale]) : t('asset.noPrice')}
        </p>
      </div>
      <Link
        href={'/' + locale + '/lease/' + encodeURIComponent(asset.id)}
        className="ui-button mt-5"
      >
        {asset.status === 'returned' ? t('spine.relist') : t('spine.open')}
      </Link>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="ui-note">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
