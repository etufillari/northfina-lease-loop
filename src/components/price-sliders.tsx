'use client';

// The term and down payment sliders. Runs the same pure pricing functions as the server, so the
// price updates on every move with no request to wait for or fail. Saving repeats the sum.
import { useId, useState } from 'react';
import type { CoefficientTable, VatRates } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { priceLeaseChoice } from '@/domain/quote-costs';
import {
  clampDownPayment,
  downPaymentToPosition,
  lowerRentOption,
  offeredTerms,
  positionToDownPayment,
  sliderPositions,
  type LeaseOffer,
} from '@/domain/quote-options';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { PriceSummary } from './price-summary';

const CENTS_PER_EURO = 100;

type PriceSlidersProps = {
  assetId: string;
  onDate: string;
  offer: Extract<LeaseOffer, { ok: true }>;
  table: CoefficientTable;
  vatRates: VatRates;
  locale: Locale;
};

export function PriceSliders({
  assetId,
  onDate,
  offer,
  table,
  vatRates,
  locale,
}: PriceSlidersProps) {
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const terms = offeredTerms(table);
  const { range } = offer;

  const [termIndex, setTermIndex] = useState(Math.floor(terms.length / 2));
  const [downPaymentCents, setDownPaymentCents] = useState(range.minCents);
  // What is typed in the box. An amount can be out of range mid-typing, so it stays as typed
  // until the box loses focus, while the price already uses the nearest allowed amount.
  const [typed, setTyped] = useState<string | null>(null);

  const termId = useId();
  const downId = useId();
  const boxId = useId();
  const hintId = useId();

  const termMonths = terms[termIndex] ?? 0;
  const result = priceLeaseChoice(table, vatRates, {
    assetId,
    onDate,
    listPriceCents: offer.listPriceCents,
    priceListVersion: offer.priceListVersion,
    downPaymentCents,
    termMonths,
  });

  const positions = sliderPositions(range);
  const onType = (text: string) => {
    setTyped(text);
    const euros = Number(text);
    if (text.trim() !== '' && Number.isFinite(euros)) {
      setDownPaymentCents(clampDownPayment(range, Math.floor(euros) * CENTS_PER_EURO));
    }
  };

  return (
    <div className="mt-6 grid gap-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={termId} className="font-medium">
            {t('price.term.label')}
          </label>
          <span className="font-semibold tabular-nums">
            {t('price.term.value', { months: termMonths })}
          </span>
        </div>
        <input
          id={termId}
          type="range"
          min={0}
          max={terms.length - 1}
          step={1}
          value={termIndex}
          aria-valuetext={t('price.term.value', { months: termMonths })}
          onChange={(event) => setTermIndex(Number(event.target.value))}
          className="mt-3 w-full accent-emerald-700"
        />
        <div
          aria-hidden="true"
          className="mt-1 flex justify-between text-xs text-stone-600 tabular-nums dark:text-stone-400"
        >
          {terms.map((term) => (
            <span key={term}>{term}</span>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <label htmlFor={downId} className="font-medium">
            {t('price.down.label')}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={boxId}
              type="number"
              inputMode="numeric"
              min={range.minCents / CENTS_PER_EURO}
              max={range.maxCents / CENTS_PER_EURO}
              step={1}
              disabled={positions === 0}
              value={typed ?? downPaymentCents / CENTS_PER_EURO}
              aria-label={t('price.down.boxLabel')}
              aria-describedby={hintId}
              onChange={(event) => onType(event.target.value)}
              onBlur={() => setTyped(null)}
              className="w-28 rounded-lg border border-stone-300 bg-white px-2 py-1 text-right font-semibold tabular-nums disabled:opacity-60 dark:border-stone-700 dark:bg-stone-950"
            />
            <span aria-hidden="true">€</span>
          </div>
        </div>
        <input
          id={downId}
          type="range"
          min={0}
          max={positions}
          step={1}
          disabled={positions === 0}
          value={downPaymentToPosition(range, downPaymentCents)}
          aria-valuetext={euro(downPaymentCents)}
          aria-describedby={hintId}
          onChange={(event) => {
            setTyped(null);
            setDownPaymentCents(positionToDownPayment(range, Number(event.target.value)));
          }}
          className="mt-3 w-full accent-emerald-700 disabled:opacity-60"
        />
        <p id={hintId} className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {positions === 0
            ? t('price.down.none')
            : t('price.down.range', { min: euro(range.minCents), max: euro(range.maxCents) })}
          {range.minCents > 0
            ? ` ${t('price.down.required', { min: euro(range.minCents) })}`
            : null}
        </p>
      </section>

      {result.ok ? (
        <PriceSummary
          quote={result.quote}
          lowerRent={lowerRentOption(table, result.quote)}
          onUseLowerRent={(cents) => {
            setTyped(null);
            setDownPaymentCents(cents);
          }}
          locale={locale}
        />
      ) : (
        <p
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950"
        >
          {t('price.error')}
        </p>
      )}
    </div>
  );
}
