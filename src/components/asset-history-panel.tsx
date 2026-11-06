// The item's history, its passport: age, usage and condition, then every life and every
// refurbishment (see src/domain/asset-timeline.ts). The data pack only counts the earliest
// lives; everything since comes from Lease Loop's own records.
import type { Asset } from '@/data/schemas';
import { assetHistory } from '@/domain/asset-history';
import type { TimelineEntry } from '@/domain/asset-timeline';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type AssetHistoryPanelProps = {
  asset: Asset;
  entries: TimelineEntry[];
  today: string;
  locale: Locale;
  t: Translate;
};

export function AssetHistoryPanel({ asset, entries, today, locale, t }: AssetHistoryPanelProps) {
  const history = assetHistory(asset, today);
  const date = (iso: string | null) => (iso ? formatIsoDate(iso, locale) : '');
  const condition = (value: string) => t(`condition.${value as Asset['condition']}`);

  function text(entry: TimelineEntry): string {
    switch (entry.kind) {
      case 'earlier':
        return entry.from === entry.to
          ? t('history.earlierOne', { number: entry.from })
          : t('history.earlier', { from: entry.from, to: entry.to });
      case 'lease':
        return t(
          `history.lease.${entry.status as 'active' | 'returned' | 'bought' | 'passed_on'}`,
          {
            number: entry.number,
            name: entry.customerName,
            start: date(entry.startDate),
            end: date(entry.endDate),
            date: date(entry.closedDate),
          }
        );
      case 'refurbished':
        return t('history.refurbished', {
          date: date(entry.date),
          from: condition(entry.conditionBefore),
          to: condition(entry.conditionAfter),
          price: formatEuro(entry.priceCents, intlLocale[locale]),
        });
      case 'next':
        return t(`history.nextLife.${entry.stage}`, { number: entry.number });
    }
  }

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
        <Fact label={t('condition.label')} value={condition(asset.condition)} />
      </dl>

      <ol className="mt-6 space-y-3">
        {entries.map((entry, index) => {
          const last = index === entries.length - 1;
          const icon =
            entry.kind === 'refurbished'
              ? '✦'
              : entry.kind === 'next' || (last && entry.kind === 'lease')
                ? '→'
                : '✓';
          return (
            <li key={index} className="flex items-start gap-3 text-sm">
              <span
                aria-hidden="true"
                className={
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                  (icon === '→'
                    ? 'bg-emerald-700 text-white'
                    : icon === '✦'
                      ? 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100'
                      : 'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200')
                }
              >
                {icon}
              </span>
              <span
                className={
                  last ? 'pt-0.5 font-semibold' : 'pt-0.5 text-stone-700 dark:text-stone-300'
                }
              >
                {text(entry)}
              </span>
            </li>
          );
        })}
      </ol>

      {entries.some((entry) => entry.kind === 'earlier') ? (
        <p className="mt-5 text-xs text-stone-600 dark:text-stone-400">{t('history.noDates')}</p>
      ) : null}
    </section>
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
