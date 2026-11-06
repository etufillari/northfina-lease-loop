// One catalogue item: photo, facts and the monthly price at the chosen term (no down
// payment). Rendered inside the client-side catalogue browser.
import type { Asset, AssetStatus } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
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
  leased: {
    badge:
      'bg-stone-100 text-stone-700 ring-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700',
    dot: 'bg-stone-500 dark:bg-stone-400',
  },
  returned: {
    badge:
      'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800',
    dot: 'bg-sky-600 dark:bg-sky-400',
  },
  sold: {
    badge:
      'bg-stone-100 text-stone-500 ring-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:ring-stone-700',
    dot: 'bg-stone-400 dark:bg-stone-500',
  },
};

const CATEGORY_ICON_SRC: Record<string, string> = {
  e_bike: '/images/categories/e_bike.png',
  laptop: '/images/categories/laptop.png',
  farm_machine: '/images/categories/farm_machine.svg',
};

/** The category symbol, drawn from public/images/categories/. Decorative: empty alt. */
export function CategoryIcon({
  category,
  className = 'size-12',
}: {
  category: string;
  className?: string;
}) {
  const src = CATEGORY_ICON_SRC[category];
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- small local decorative SVG
  return <img src={src} alt="" aria-hidden="true" className={className} />;
}

export function AssetImage({
  imageUrl,
  category,
  alt,
  className = 'aspect-[3/2] w-full rounded-t-2xl object-cover',
}: {
  imageUrl: string | null;
  category: string;
  alt: string;
  className?: string;
}) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- local files of unknown size
    return <img src={imageUrl} alt={alt} className={className} />;
  }
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center bg-stone-100 dark:bg-stone-800 ${className}`}
    >
      <CategoryIcon category={category} className="size-20 opacity-90" />
    </div>
  );
}

type AssetCardProps = {
  asset: Asset;
  imageUrl: string | null;
  /** The net list price on the as-of date (the second-life re-price when there is one). */
  listPriceCents: number | null;
  /** Monthly rent at the chosen term, no down payment; null when it cannot be priced. */
  monthly: { netCents: number; grossCents: number } | null;
  termMonths: number;
  vatRatePercent: number | null;
  /** Priced at the second-life desk's re-price instead of the price list. */
  secondLife?: boolean;
  locale: Locale;
  t: Translate;
};

export function AssetCard({
  asset,
  imageUrl,
  listPriceCents,
  monthly,
  termMonths,
  vatRatePercent,
  secondLife = false,
  locale,
  t,
}: AssetCardProps) {
  const headingId = `asset-${asset.id}`;
  const status = statusStyles[asset.status];

  return (
    <article
      aria-labelledby={headingId}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
    >
      <AssetImage
        imageUrl={imageUrl}
        category={asset.category}
        alt={`${asset.make} ${asset.model}`}
      />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-stone-600 dark:text-stone-400">{asset.make}</p>
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
            value={t(`usage.${asset.usage.unit}`, {
              value: formatNumber(asset.usage.value, locale),
            })}
          />
          <Fact
            label={t('asset.previousLives')}
            value={formatNumber(asset.previous_lives, locale)}
          />
        </dl>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-stone-100 pt-4 dark:border-stone-800">
          <div>
            <p className="text-xs text-stone-600 dark:text-stone-400">
              {secondLife ? t('asset.secondLifePrice') : t('asset.listPrice')}
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {listPriceCents !== null
                ? formatEuro(listPriceCents, intlLocale[locale])
                : t('asset.noPrice')}
            </p>
          </div>
          <div className="text-right">
            {monthly ? (
              <>
                <p className="text-xl font-semibold tabular-nums">
                  {formatEuro(monthly.grossCents, intlLocale[locale])}
                  <span className="text-sm font-normal text-stone-600 dark:text-stone-400">
                    {t('common.perMonth')}
                  </span>
                </p>
                <p className="text-xs text-stone-600 dark:text-stone-400">
                  {t('catalogue.payments', { count: termMonths })}
                  {vatRatePercent !== null
                    ? ` · ${t('price.inclVat', { rate: vatRatePercent })}`
                    : ''}{' '}
                  · {t('catalogue.noDownPayment')}
                </p>
              </>
            ) : (
              <p className="text-xl font-semibold">{t('asset.noPrice')}</p>
            )}
          </div>
        </div>
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
