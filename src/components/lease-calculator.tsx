'use client';

import { useEffect, useRef, useState } from 'react';
import {
  downPaymentAtPosition,
  lastDownPaymentPosition,
  type LeaseLimits,
} from '@/domain/pricing/lease-limits';
import { formatEuro } from '@/domain/money';
import type { QuoteData } from '@/domain/pricing/quote';
import { formatNumber } from '@/i18n/format';
import { intlLocale, type Locale } from '@/i18n/locales';

/** Long enough to skip the values a slider passes through while it is being dragged. */
const QUOTE_DELAY_MS = 150;

export type LeaseCalculatorLabels = {
  downPayment: string;
  termLength: string;
  months: string;
  monthlyWithVat: string;
  monthlyNet: string;
  vat: string;
  financed: string;
  buyout: string;
  totalCost: string;
  bandNote: string;
  unavailable: string;
  updateFailed: string;
  continueToApplication: string;
};

type LeaseCalculatorProps = {
  assetId: string;
  date: string;
  limits: LeaseLimits;
  initialQuote: QuoteData;
  labels: LeaseCalculatorLabels;
  locale: Locale;
  onContinue?: (quote: QuoteData) => void;
};

type QuoteFailure = 'unavailable' | 'failed';
type QuoteOutcome = { quote: QuoteData } | { failure: QuoteFailure };
type QuoteRequest = {
  assetId: string;
  date: string;
  downPaymentCents: number;
  termMonths: number;
};
type QuoteResponse =
  { success: true; data: QuoteData } | { success: false; error: { code: string } };

async function fetchQuote(request: QuoteRequest, signal: AbortSignal): Promise<QuoteOutcome> {
  try {
    const response = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    const body = (await response.json()) as QuoteResponse;
    if (body.success) return { quote: body.data };
    return { failure: body.error.code === 'ASSET_UNAVAILABLE' ? 'unavailable' : 'failed' };
  } catch {
    return { failure: 'failed' };
  }
}

export function LeaseCalculator({
  assetId,
  date,
  limits,
  initialQuote,
  labels,
  locale,
  onContinue,
}: LeaseCalculatorProps) {
  const [termMonths, setTermMonths] = useState(limits.defaultTermMonths);
  const [position, setPosition] = useState(0);
  const [outcome, setOutcome] = useState<QuoteOutcome>({ quote: initialQuote });
  const [isUpdating, setIsUpdating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inFlight = useRef<AbortController>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      inFlight.current?.abort();
    },
    []
  );

  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const monthsLabel = (months: number) => `${months} ${labels.months}`;
  const downPaymentCents = downPaymentAtPosition(limits, position);
  const lastPosition = lastDownPaymentPosition(limits);
  const termIndex = limits.termOptions.indexOf(termMonths);

  function choose(nextTermMonths: number, nextPosition: number) {
    setTermMonths(nextTermMonths);
    setPosition(nextPosition);
    setIsUpdating(true);

    // Only the newest choice counts, so an older answer can never overwrite it.
    clearTimeout(timer.current);
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    const request = {
      assetId,
      date,
      downPaymentCents: downPaymentAtPosition(limits, nextPosition),
      termMonths: nextTermMonths,
    };
    timer.current = setTimeout(async () => {
      const next = await fetchQuote(request, controller.signal);
      if (controller.signal.aborted) return;
      setOutcome(next);
      setIsUpdating(false);
    }, QUOTE_DELAY_MS);
  }

  return (
    <section
      aria-label={`${labels.downPayment}, ${labels.termLength}`}
      className="grid gap-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm lg:grid-cols-2 dark:border-stone-800 dark:bg-stone-900"
    >
      <div className="flex flex-col gap-8">
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <label htmlFor="term-length" className="font-medium">
              {labels.termLength}
            </label>
            <output htmlFor="term-length" className="font-semibold tabular-nums">
              {monthsLabel(termMonths)}
            </output>
          </div>
          <input
            id="term-length"
            type="range"
            min={0}
            max={limits.termOptions.length - 1}
            step={1}
            value={termIndex}
            onChange={(event) =>
              choose(limits.termOptions[Number(event.target.value)] ?? termMonths, position)
            }
            className="mt-4 w-full accent-emerald-700"
            aria-valuetext={monthsLabel(termMonths)}
          />
          <div
            aria-hidden="true"
            className="mt-1 flex justify-between text-xs text-stone-600 tabular-nums dark:text-stone-400"
          >
            {limits.termOptions.map((option) => (
              <span key={option}>{option}</span>
            ))}
          </div>
        </div>

        {lastPosition === 0 ? (
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium">{labels.downPayment}</span>
            <span className="font-semibold tabular-nums">{euro(downPaymentCents)}</span>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <label htmlFor="down-payment" className="font-medium">
                {labels.downPayment}
              </label>
              <output htmlFor="down-payment" className="font-semibold tabular-nums">
                {euro(downPaymentCents)}
              </output>
            </div>
            <input
              id="down-payment"
              type="range"
              min={0}
              max={lastPosition}
              step={1}
              value={position}
              onChange={(event) => choose(termMonths, Number(event.target.value))}
              className="mt-4 w-full accent-emerald-700"
              aria-valuetext={euro(downPaymentCents)}
            />
            <div
              aria-hidden="true"
              className="mt-1 flex justify-between text-xs text-stone-600 tabular-nums dark:text-stone-400"
            >
              <span>{euro(limits.minDownPaymentCents)}</span>
              <span>{euro(limits.maxDownPaymentCents)}</span>
            </div>
          </div>
        )}
      </div>

      <div
        aria-live="polite"
        aria-busy={isUpdating}
        className={`transition-opacity ${isUpdating ? 'opacity-60' : ''}`}
      >
        {'quote' in outcome ? (
          <QuoteSummary
            quote={outcome.quote}
            labels={labels}
            euro={euro}
            locale={locale}
            continueDisabled={isUpdating}
            onContinue={onContinue}
          />
        ) : (
          <p className="rounded-xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
            {outcome.failure === 'unavailable' ? labels.unavailable : labels.updateFailed}
          </p>
        )}
      </div>
    </section>
  );
}

type QuoteSummaryProps = {
  quote: QuoteData;
  labels: LeaseCalculatorLabels;
  euro: (cents: number) => string;
  locale: Locale;
  continueDisabled: boolean;
  onContinue?: (quote: QuoteData) => void;
};

function QuoteSummary({
  quote,
  labels,
  euro,
  locale,
  continueDisabled,
  onContinue,
}: QuoteSummaryProps) {
  const { pricing, vatPreview } = quote;
  const vatRate = formatNumber(vatPreview.ratePercent, locale);

  return (
    <>
      <p className="text-sm text-stone-600 dark:text-stone-400">{labels.monthlyWithVat}</p>
      <p className="text-4xl font-semibold tabular-nums">
        {euro(vatPreview.monthlyGrossRentCents)}
      </p>
      <dl className="mt-5 grid gap-2 text-sm">
        <Row label={labels.monthlyNet} value={euro(pricing.monthlyNetRentCents)} />
        <Row label={`${labels.vat} (${vatRate} %)`} value={euro(vatPreview.monthlyVatCents)} />
        <Row label={labels.financed} value={euro(pricing.financedCents)} />
        <Row
          label={`${labels.buyout} (${pricing.buyoutPercent} %)`}
          value={euro(pricing.endOfTermBuyoutCents)}
        />
        <Row label={labels.totalCost} value={euro(pricing.totalCostWithBuyoutCents)} />
      </dl>
      <p className="mt-4 text-xs text-stone-600 dark:text-stone-400">{labels.bandNote}</p>
      {onContinue ? (
        <button
          type="button"
          onClick={() => onContinue(quote)}
          disabled={continueDisabled}
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          {labels.continueToApplication}
          <span aria-hidden="true" className="ml-2">
            →
          </span>
        </button>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
