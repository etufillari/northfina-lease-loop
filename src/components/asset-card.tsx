// One catalogue item. A server component: it renders to HTML and ships no JavaScript.
import type { Asset } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import type { AssetPriceResult } from '@/domain/pricing/price-list';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { AssetStatusBadge } from '@/components/ui/asset-status-badge';
import { categoryFallbackImages } from '@/data/asset-images';
import Image from 'next/image';
import Link from 'next/link';

type AssetCardProps = {
  asset: Asset;
  price: AssetPriceResult;
  leasePrice: number;
  locale: Locale;
  t: Translate;
};

export function AssetCard({ asset, price, leasePrice, locale, t }: AssetCardProps) {
  const headingId = `asset-${asset.id}`;
  const fallbackImage = categoryFallbackImages[asset.category];

  return (
    <Link href={`/${locale}/assets/${asset.id}`} className="group block">
      <article
        aria-labelledby={headingId}
        className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
      >
        <div className="relative mb-4 aspect-[16/9] overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800">
          <Image
            src={fallbackImage}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover"
          />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-stone-600 dark:text-stone-400">{asset.make}</p>
            <h3 id={headingId} className="text-lg leading-snug font-semibold">
              {asset.model}
            </h3>
          </div>
          <AssetStatusBadge status={asset.status} t={t} />
        </div>

        <dl className="mt-4 mb-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Fact label={t('condition.label')} value={t(`condition.${asset.condition}`)} />
          <Fact label={t('asset.modelYear')} value={String(asset.model_year)} />
          <Fact
            label={t('asset.usage')}
            value={t(`usage.${asset.usage.unit}`, {
              value: formatNumber(asset.usage.value, locale),
            })}
          />
          <Fact
            label={t('asset.previousLives')}
            value={formatNumber(asset.previous_lives, locale)}
          />
        </dl>

        {/* List price */}
        <div className="mt-auto border-t border-stone-100 pt-4 dark:border-stone-800">
          <div className="flex items-end justify-between gap-3 px-3">
            <div className="text-xs text-stone-600 dark:text-stone-400">
              <p>{t('asset.listPrice')}</p>
              {price.ok ? (
                <p>
                  {price.priceListVersion === null
                    ? t('asset.secondLifePrice')
                    : t('asset.priceListVersion', { version: price.priceListVersion })}
                </p>
              ) : null}
            </div>

            <p className="text-right text-xl font-semibold tabular-nums">
              {price.ok ? formatEuro(price.priceCents, intlLocale[locale]) : t('asset.noPrice')}
            </p>
          </div>

          {/* Estimated lease price */}
          {price.ok && (
            <div className="mt-4 rounded-xl bg-stone-50 px-3 py-3 dark:bg-stone-800/60">
              <div className="flex items-end justify-between gap-3">
                <div className="text-xs text-stone-600 dark:text-stone-400">
                  <p>{t('asset.estimatedLeasePrice')}</p>
                  <p>{t('asset.estimatedLeaseVat')}</p>
                  <p>{t('asset.leaseDuration', { months: 12 })}</p>
                </div>

                <div className="text-right">
                  <p className="text-xl font-semibold tabular-nums">
                    {formatEuro(leasePrice, intlLocale[locale])}
                  </p>
                  <p className="text-sm text-stone-500 dark:text-stone-400">/ {t('asset.month')}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </article>
    </Link>
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
