// One catalogue item. A server component: it renders to HTML and ships no JavaScript.
import Link from 'next/link';
import type { Asset, AssetStatus } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import type { ItemPriceResult } from '@/domain/pricing/item-price';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

const statusStyles: Record<AssetStatus, { badge: string; dot: string }> = {
  available: {
    badge:
      'bg-green-50 text-green-900 ring-green-200 dark:bg-green-950 dark:text-green-200 dark:ring-green-800',
    dot: 'bg-green-600 dark:bg-green-400',
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
  sold: {
    badge:
      'bg-ink-100 text-ink-800 ring-ink-300 dark:bg-ink-800 dark:text-ink-200 dark:ring-ink-600',
    dot: 'bg-ink-600 dark:bg-ink-400',
  },
};

type AssetCardProps = {
  asset: Asset;
  price: ItemPriceResult;
  locale: Locale;
  t: Translate;
};

export function AssetCard({ asset, price, locale, t }: AssetCardProps) {
  const headingId = `asset-${asset.id}`;
  const status = statusStyles[asset.status];
  const usedPrice = price.ok && price.basis === 'market_value';
  const leasable = asset.status === 'available';

  return (
    <article
      aria-labelledby={headingId}
      className={`group relative flex h-full flex-col rounded-2xl border border-ink-200 bg-white p-5 shadow-sm dark:border-ink-800 dark:bg-ink-900 ${
        leasable
          ? 'transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md motion-reduce:transform-none dark:hover:border-brand-700'
          : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-600 dark:text-ink-400">{asset.make}</p>
          <h3 id={headingId} className="text-lg leading-snug font-semibold">
            {asset.model}
          </h3>
        </div>
        <p
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${status.badge}`}
        >
          <span aria-hidden="true" className={`size-1.5 rounded-full ${status.dot}`} />
          <span className="sr-only">{t('status.label')}: </span>
          {t(`status.${asset.status}`)}
        </p>
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

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-ink-100 pt-4 dark:border-ink-800">
        <div className="text-xs text-ink-600 dark:text-ink-400">
          <p>{t(usedPrice ? 'asset.marketValue' : 'asset.listPrice')}</p>
          {price.ok && !usedPrice ? (
            <p>{t('asset.priceListVersion', { version: price.priceListVersion })}</p>
          ) : null}
        </div>
        <p className="text-right text-xl font-semibold tabular-nums">
          {price.ok ? formatEuro(price.priceCents, intlLocale[locale]) : t('asset.noPrice')}
        </p>
      </div>

      {leasable ? (
        <>
          {/* The ::after overlay stretches this link across the card, so the whole card is
              clickable while screen readers and the keyboard still get one short link. */}
          <Link
            href={`/${locale}/catalogue/${asset.category}/${asset.id}`}
            aria-describedby={headingId}
            className="mt-4 font-medium text-brand-800 underline-offset-4 group-hover:underline after:absolute after:inset-0 after:rounded-2xl dark:text-brand-300"
          >
            {t('asset.chooseLease')}
          </Link>
        </>
      ) : null}
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-600 dark:text-ink-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
