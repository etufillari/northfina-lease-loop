// The date filter: quick presets (links) and a custom from/to range (a plain GET form, so it
// works without JavaScript and the result has a shareable URL).
import Link from 'next/link';
import { FORECAST_PRESETS, presetRange, type ForecastPreset } from '@/domain/lease-forecast';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { buttonClass, fieldClass } from './action-error';

type Props = {
  locale: Locale;
  today: string;
  range: { from: string; to: string };
  preset: ForecastPreset | null;
  /** Why the dates in the URL were not used, already translated. */
  notice: string | null;
  t: Translate;
};

export function ForecastFilter({ locale, today, range, preset, notice, t }: Props) {
  return (
    <section
      aria-labelledby="forecast-filter"
      className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 id="forecast-filter" className="text-lg font-semibold">
        {t('dealer.forecast.filter.title')}
      </h2>

      <ul className="mt-3 flex flex-wrap gap-2">
        {FORECAST_PRESETS.map((name) => {
          const target = presetRange(today, name);
          const active = name === preset;
          return (
            <li key={name}>
              <Link
                href={`/${locale}/dealer/forecast?from=${target.from}&to=${target.to}`}
                aria-current={active ? 'true' : undefined}
                className={
                  'inline-block rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors ' +
                  (active
                    ? 'bg-emerald-700 text-white ring-emerald-700'
                    : 'bg-white text-stone-800 ring-stone-300 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-700 dark:hover:bg-stone-800')
                }
              >
                {t(`dealer.forecast.preset.${name}`)}
              </Link>
            </li>
          );
        })}
      </ul>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-4">
        <label className="text-sm font-medium">
          {t('dealer.forecast.filter.from')}
          <input
            type="date"
            name="from"
            required
            defaultValue={range.from}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          {t('dealer.forecast.filter.to')}
          <input type="date" name="to" required defaultValue={range.to} className={fieldClass} />
        </label>
        <button type="submit" className={buttonClass}>
          {t('dealer.forecast.filter.apply')}
        </button>
      </form>

      {notice ? (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800"
        >
          {notice}
        </p>
      ) : null}
    </section>
  );
}
