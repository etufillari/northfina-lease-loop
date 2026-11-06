import Image from 'next/image';

import type { Asset } from '@/data/schemas';
import type { Locale } from '@/i18n/locales';
import type { Translate } from '@/i18n/get-t';

import { categoryFallbackImages } from '@/data/asset-images';
import { formatEuro } from '@/domain/money';
import { formatNumber } from '@/i18n/format';
import { intlLocale } from '@/i18n/locales';
import { AssetStatusBadge } from '@/components/ui/asset-status-badge';

type AssetDetailsProps = {
  asset: Asset;
  locale: Locale;
  t: Translate;
  priceCents: number | null;
};

export function AssetDetails({ asset, locale, t, priceCents }: AssetDetailsProps) {
  return (
    <section className="min-w-0">
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-stone-100 dark:bg-stone-800">
        <Image
          src={categoryFallbackImages[asset.category]}
          alt=""
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 60vw"
          className="object-cover"
        />
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-600 dark:text-stone-400">{asset.make}</p>

          <AssetStatusBadge status={asset.status} heldForYou={asset.held_for_you} t={t} />
        </div>

        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{asset.model}</h1>

        {priceCents !== null && (
          <div className="mt-5">
            <p className="text-sm text-stone-600 dark:text-stone-400">{t('asset.listPrice')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {formatEuro(priceCents, intlLocale[locale])}
            </p>
          </div>
        )}

        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5">
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
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
