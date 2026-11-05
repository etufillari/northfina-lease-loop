'use client';

import { useState } from 'react';
import { formatEuro } from '@/domain/money';
import { intlLocale, type Locale } from '@/i18n/locales';

type CatalogueControlLabels = {
  downPayment: string;
  termLength: string;
  month: string;
  months: string;
};

type CatalogueControlsProps = {
  labels: CatalogueControlLabels;
  locale: Locale;
};

export function CatalogueControls({ labels, locale }: CatalogueControlsProps) {
  const [downPaymentCents, setDownPaymentCents] = useState(0);
  const [termMonths, setTermMonths] = useState(36);

  return (
    <section
      aria-label={`${labels.downPayment}, ${labels.termLength}`}
      className="mt-10 grid gap-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2 dark:border-stone-800 dark:bg-stone-900"
    >
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="down-payment" className="font-medium">
            {labels.downPayment}
          </label>
          <output htmlFor="down-payment" className="font-semibold tabular-nums">
            {formatEuro(downPaymentCents, intlLocale[locale])}
          </output>
        </div>
        <input
          id="down-payment"
          type="range"
          min={0}
          max={1_000_000}
          step={25_000}
          value={downPaymentCents}
          onChange={(event) => setDownPaymentCents(Number(event.target.value))}
          className="mt-4 w-full accent-emerald-700"
          aria-valuetext={formatEuro(downPaymentCents, intlLocale[locale])}
        />
        <div className="mt-1 flex justify-between text-xs text-stone-600 dark:text-stone-400">
          <span>{formatEuro(0, intlLocale[locale])}</span>
          <span>{formatEuro(1_000_000, intlLocale[locale])}</span>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="term-length" className="font-medium">
            {labels.termLength}
          </label>
          <output htmlFor="term-length" className="font-semibold tabular-nums">
            {termMonths} {termMonths === 1 ? labels.month : labels.months}
          </output>
        </div>
        <input
          id="term-length"
          type="range"
          min={1}
          max={36}
          step={1}
          value={termMonths}
          onChange={(event) => setTermMonths(Number(event.target.value))}
          className="mt-4 w-full accent-emerald-700"
          aria-valuetext={`${termMonths} ${termMonths === 1 ? labels.month : labels.months}`}
        />
        <div className="mt-1 flex justify-between text-xs text-stone-600 dark:text-stone-400">
          <span>1 {labels.month}</span>
          <span>36 {labels.months}</span>
        </div>
      </div>
    </section>
  );
}
