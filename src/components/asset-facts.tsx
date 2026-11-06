// The facts about one item: condition, year, usage and earlier leases.
import type { Asset } from '@/data/schemas';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type AssetFactsProps = {
  asset: Asset;
  locale: Locale;
  t: Translate;
  className?: string;
};

export function AssetFacts({ asset, locale, t, className = '' }: AssetFactsProps) {
  return (
    <dl className={`grid grid-cols-2 gap-x-4 gap-y-3 text-sm ${className}`}>
      <Fact label={t('condition.label')} value={t(`condition.${asset.condition}`)} />
      <Fact label={t('asset.modelYear')} value={String(asset.model_year)} />
      <Fact
        label={t('asset.usage')}
        value={t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) })}
      />
      <Fact label={t('asset.previousLives')} value={formatNumber(asset.previous_lives, locale)} />
    </dl>
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
