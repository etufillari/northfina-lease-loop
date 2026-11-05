'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { CoefficientTable } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import {
  MAX_DOWN_PAYMENT_CENTS,
  monthlyRentFor,
  parseDownPaymentCents,
} from '@/domain/monthly-rent';
import { intlLocale, type Locale } from '@/i18n/locales';

type PricingLabels = {
  controls: string;
  downPayment: string;
  downPaymentHelp: string;
  invalidDownPayment: string;
  term: string;
  quoteUnavailable: string;
};

type PricingContextValue = {
  table: CoefficientTable;
  downPaymentCents: number | undefined;
  termMonths: number;
  locale: Locale;
  quoteUnavailable: string;
};

const PricingContext = createContext<PricingContextValue | null>(null);

export function CataloguePricing({
  table,
  locale,
  labels,
  termOptions,
  initialDownPayment,
  initialTermMonths,
  children,
}: {
  table: CoefficientTable;
  locale: Locale;
  labels: PricingLabels;
  termOptions: { value: number; label: string }[];
  initialDownPayment: string;
  initialTermMonths: number;
  children: ReactNode;
}) {
  const [downPaymentInput, setDownPaymentInput] = useState(initialDownPayment);
  const [termMonths, setTermMonths] = useState(initialTermMonths);
  const downPaymentCents = parseDownPaymentCents(downPaymentInput);
  const selectedTerm = termOptions.find((option) => option.value === termMonths);

  function updateQueryParameter(name: string, value: string | undefined) {
    const url = new URL(window.location.href);
    if (value === undefined) url.searchParams.delete(name);
    else url.searchParams.set(name, value);
    window.history.replaceState(null, '', url);
  }

  return (
    <PricingContext.Provider
      value={{
        table,
        downPaymentCents,
        termMonths,
        locale,
        quoteUnavailable: labels.quoteUnavailable,
      }}
    >
      <section
        aria-labelledby="pricing-controls-heading"
        className="mt-6 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
      >
        <h2 id="pricing-controls-heading" className="sr-only">
          {labels.controls}
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="down-payment"
              className="block text-sm font-medium text-stone-700 dark:text-stone-300"
            >
              {labels.downPayment}
            </label>
            <input
              id="down-payment"
              type="number"
              min="0"
              max={MAX_DOWN_PAYMENT_CENTS / 100}
              step="0.01"
              className="no-number-spinner mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
              value={downPaymentInput}
              aria-invalid={downPaymentCents === undefined}
              aria-describedby={
                downPaymentCents === undefined ? 'down-payment-error' : 'down-payment-help'
              }
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDownPaymentInput(value);
                updateQueryParameter('downPayment', value === '0' ? undefined : value);
              }}
            />
            <p
              id={downPaymentCents === undefined ? 'down-payment-error' : 'down-payment-help'}
              role={downPaymentCents === undefined ? 'alert' : undefined}
              className={`mt-1 text-xs ${
                downPaymentCents === undefined
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              {downPaymentCents === undefined ? labels.invalidDownPayment : labels.downPaymentHelp}
            </p>
          </div>
          <div>
            <label
              htmlFor="lease-term"
              className="block text-sm font-medium text-stone-700 dark:text-stone-300"
            >
              {labels.term}
            </label>
            <div className="mt-2 max-w-sm">
              <div className="mb-1 flex justify-end">
                <output htmlFor="lease-term" className="text-sm font-medium">
                  {selectedTerm?.label}
                </output>
              </div>
              <input
                id="lease-term"
                type="range"
                min="0"
                max="48"
                step="12"
                value={termMonths}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  setTermMonths(value);
                  updateQueryParameter('term', value === 0 ? undefined : String(value));
                }}
                className="lease-term-slider block w-full"
                aria-valuetext={selectedTerm?.label}
              />
              <div
                aria-hidden="true"
                className="mt-1 flex justify-between px-2 text-xs text-stone-500"
              >
                {termOptions.map((option) => (
                  <span key={option.value}>{option.value}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      {children}
    </PricingContext.Provider>
  );
}

export function MonthlyRate({ listPriceCents }: { listPriceCents: number | undefined }) {
  const pricing = useContext(PricingContext);
  if (!pricing) throw new Error('MonthlyRate must be rendered inside CataloguePricing');
  if (pricing.termMonths === 0) {
    return <span>{formatEuro(0, intlLocale[pricing.locale])}</span>;
  }
  if (pricing.downPaymentCents === undefined) {
    return <span>{pricing.quoteUnavailable}</span>;
  }

  const result = monthlyRentFor(
    pricing.table,
    listPriceCents,
    pricing.downPaymentCents,
    pricing.termMonths
  );
  return (
    <span>
      {result.ok
        ? formatEuro(result.monthlyRentCents, intlLocale[pricing.locale])
        : pricing.quoteUnavailable}
    </span>
  );
}
