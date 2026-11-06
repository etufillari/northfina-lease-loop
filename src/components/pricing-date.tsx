'use client';

// The day the prices are for. Normally today, but a quote can be replayed for an earlier day,
// which is how the price-lock scenario shows the old and new price lists side by side.
import { usePathname, useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type PricingDateProps = {
  onDate: string;
  today: string;
  earliest: string;
  locale: Locale;
};

export function PricingDate({ onDate, today, earliest, locale }: PricingDateProps) {
  const t = getT(locale);
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(onDate);
  const inputId = useId();

  const showPricesFor = (date: string) => {
    setValue(date);
    const params = new URLSearchParams(window.location.search);
    if (date === today) params.delete('on');
    else params.set('on', date);
    router.replace(`${pathname}?${params}`, { scroll: false });
  };

  return (
    <div className="mt-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor={inputId} className="font-medium">
          {t('price.date.label')}
        </label>
        <input
          id={inputId}
          type="date"
          min={earliest}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            // Half-typed dates and days before the first price list wait here.
            if (event.target.value && event.target.validity.valid) {
              showPricesFor(event.target.value);
            }
          }}
          className="rounded-lg border border-stone-300 bg-white px-2 py-1 dark:border-stone-700 dark:bg-stone-950"
        />
        {onDate !== today ? (
          <button
            type="button"
            onClick={() => showPricesFor(today)}
            className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
          >
            {t('price.date.today')}
          </button>
        ) : null}
      </div>
      {onDate !== today ? (
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          {t('price.date.notice', { date: formatIsoDate(onDate, locale) })}
        </p>
      ) : null}
    </div>
  );
}
