'use client';

import { useState } from 'react';
import type { CoefficientTable } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { canStartLease, monthlyRentFor, parseDownPaymentCents } from '@/domain/monthly-rent';
import { intlLocale, type Locale } from '@/i18n/locales';
import { LeaseStartButton, useLeaseApplicationContext } from './lease-application';

type AssetPricingControlsProps = {
  table: CoefficientTable;
  listPriceCents: number | undefined;
  locale: Locale;
  initialDownPaymentCents: number;
  initialTermMonths: number;
  termOptions: { value: number; label: string }[];
  labels: {
    monthlyRate: string;
    downPayment: string;
    term: string;
    quoteUnavailable: string;
  };
  available: boolean;
};

export function AssetPricingControls({
  table,
  listPriceCents,
  locale,
  initialDownPaymentCents,
  initialTermMonths,
  termOptions,
  labels,
  available,
}: AssetPricingControlsProps) {
  const maximumDownPayment = listPriceCents ?? 0;
  const initialCents = Math.min(initialDownPaymentCents, maximumDownPayment);
  const [downPaymentInput, setDownPaymentInput] = useState(String(initialCents / 100));
  const [termMonths, setTermMonths] = useState(initialTermMonths);
  const { offer, setOffer } = useLeaseApplicationContext();
  const downPaymentCents = parseDownPaymentCents(downPaymentInput);
  const monthlyRent =
    termMonths === 0
      ? { ok: true as const, monthlyRentCents: 0 }
      : downPaymentCents === undefined
        ? undefined
        : monthlyRentFor(table, listPriceCents, downPaymentCents, termMonths);

  function updateUrl(name: string, value: number | string, defaultValue: number | string) {
    const url = new URL(window.location.href);
    if (value === defaultValue) url.searchParams.delete(name);
    else url.searchParams.set(name, String(value));
    window.history.replaceState(null, '', url);
  }

  return (
    <div>
      <p className="text-sm text-stone-600 dark:text-stone-400">{labels.monthlyRate}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">
        {monthlyRent?.ok
          ? formatEuro(monthlyRent.monthlyRentCents, intlLocale[locale])
          : labels.quoteUnavailable}
      </p>
      <div className="mt-6 space-y-6 border-t border-stone-200 pt-5 dark:border-stone-800">
        <div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="detail-down-payment" className="text-sm font-medium">
              {labels.downPayment}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-stone-600 dark:text-stone-400">€</span>
              <input
                id="detail-down-payment"
                type="number"
                min="0"
                max={maximumDownPayment / 100}
                step="0.01"
                value={downPaymentInput}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDownPaymentInput(value);
                  const parsed = parseDownPaymentCents(value);
                  if (parsed !== undefined) {
                    updateUrl('downPayment', value, '0');
                    const quote = monthlyRentFor(table, listPriceCents, parsed, termMonths);
                    if (quote.ok) {
                      setOffer({
                        ...offer,
                        downPaymentCents: parsed,
                        termMonths,
                        monthlyNetCents: quote.monthlyRentCents,
                      });
                    }
                  }
                }}
                className="no-number-spinner w-28 rounded-lg border border-stone-300 bg-white px-2 py-1 text-right text-sm font-semibold tabular-nums text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                aria-invalid={downPaymentCents === undefined}
              />
            </div>
          </div>
          <input
            id="detail-down-payment-slider"
            type="range"
            min="0"
            max={maximumDownPayment}
            step="100"
            value={downPaymentCents ?? 0}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              const input = String(value / 100);
              setDownPaymentInput(input);
              updateUrl('downPayment', input, '0');
            }}
            className="lease-term-slider mt-3 block w-full"
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="detail-lease-term" className="text-sm font-medium">
              {labels.term}
            </label>
            <output htmlFor="detail-lease-term" className="text-sm font-semibold">
              {termOptions.find((option) => option.value === termMonths)?.label}
            </output>
          </div>
          <input
            id="detail-lease-term"
            type="range"
            min="0"
            max="48"
            step="12"
            value={termMonths}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              setTermMonths(value);
              updateUrl('term', value, 0);
              const parsed = parseDownPaymentCents(downPaymentInput);
              const quote =
                parsed === undefined
                  ? undefined
                  : monthlyRentFor(table, listPriceCents, parsed, value);
              if (parsed !== undefined && quote?.ok) {
                setOffer({
                  ...offer,
                  downPaymentCents: parsed,
                  termMonths: value,
                  monthlyNetCents: quote.monthlyRentCents,
                });
              }
            }}
            className="lease-term-slider mt-3 block w-full"
          />
          <div aria-hidden="true" className="mt-1 flex justify-between px-1 text-xs text-stone-500">
            {termOptions.map((option) => (
              <span key={option.value}>{option.value}</span>
            ))}
          </div>
        </div>
      </div>
      <LeaseStartButton
        available={available}
        canStart={canStartLease(listPriceCents, downPaymentCents, termMonths)}
      />
    </div>
  );
}
