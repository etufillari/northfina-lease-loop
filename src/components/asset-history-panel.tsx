// The item's history so far: one step per completed lease, then where it is now.
// The data pack only records how many leases an item has had, not when, so this says so.
import type { Asset } from '@/data/schemas';
import { assetHistory } from '@/domain/asset-history';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type AssetHistoryPanelProps = { asset: Asset; today: string; locale: Locale; t: Translate };

export function AssetHistoryPanel({ asset, today, locale, t }: AssetHistoryPanelProps) {
  const history = assetHistory(asset, today);
  const pastLives = Array.from({ length: history.previousLives }, (_, index) => index + 1);

  return (
    <section
      aria-labelledby="history-heading"
      className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 id="history-heading" className="text-lg font-semibold">
        {t('history.title')}
      </h2>

      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <Fact
          label={t('history.age')}
          value={
            history.ageYears === 0
              ? t('history.ageNew', { year: asset.model_year })
              : t('history.ageValue', { years: history.ageYears, year: asset.model_year })
          }
        />
        <Fact
          label={t('asset.usage')}
          value={t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) })}
        />
        <Fact label={t('condition.label')} value={t(`condition.${asset.condition}`)} />
      </dl>

      <ol className="mt-6 space-y-3">
        {pastLives.map((life) => (
          <Step key={life} done text={t('history.pastLife', { number: life })} />
        ))}
        <Step text={t(`history.nextLife.${history.stage}`, { number: history.nextLife })} current />
      </ol>

      <p className="mt-5 text-xs text-stone-600 dark:text-stone-400">{t('history.noDates')}</p>
    </section>
  );
}

function Step({ text, done, current }: { text: string; done?: boolean; current?: boolean }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span
        aria-hidden="true"
        className={
          'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
          (done
            ? 'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200'
            : 'bg-emerald-700 text-white')
        }
      >
        {done ? '✓' : '→'}
      </span>
      <span className={current ? 'font-semibold' : 'text-stone-700 dark:text-stone-300'}>
        {text}
      </span>
    </li>
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
