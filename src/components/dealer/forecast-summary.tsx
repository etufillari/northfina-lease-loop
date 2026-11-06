// The numbers at the top of the forecast: how many leases end, and what state they are in.
import type { ForecastSummary } from '@/domain/lease-forecast';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type Props = { summary: ForecastSummary; locale: Locale; t: Translate };

export function ForecastSummaryCards({ summary, locale, t }: Props) {
  const cards = [
    { key: 'total', label: t('dealer.forecast.summary.total'), value: summary.total },
    {
      key: 'requested',
      label: t('dealer.forecast.summary.returnRequested'),
      value: summary.returnRequested,
    },
    {
      key: 'noReturn',
      label: t('dealer.forecast.summary.noReturnYet'),
      value: summary.noReturnYet,
    },
    { key: 'soon', label: t('dealer.forecast.summary.endingSoon'), value: summary.endingSoon },
  ];

  return (
    <section aria-labelledby="forecast-summary" className="mt-8">
      <h2 id="forecast-summary" className="sr-only">
        {t('dealer.forecast.summary.title')}
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.key}
            className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900"
          >
            <dt className="text-sm text-stone-600 dark:text-stone-400">{card.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {formatNumber(card.value, locale)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
        {t('dealer.forecast.summary.byCategory', {
          eBikes: formatNumber(summary.byCategory.e_bike, locale),
          laptops: formatNumber(summary.byCategory.laptop, locale),
          farm: formatNumber(summary.byCategory.farm_machine, locale),
        })}
      </p>
    </section>
  );
}
