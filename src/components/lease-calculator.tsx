'use client';

import { useState } from 'react';
import type { CoefficientTable } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { invoiceAmounts } from '@/domain/lease-billing';
import { MAX_LEASE_TERM_MONTHS, quoteLease } from '@/domain/pricing';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { AddToCart } from './add-to-cart';

export function LeaseCalculator({
  priceCents,
  table,
  locale,
  assetId,
  available,
  vatBasisPoints,
}: {
  priceCents: number;
  table: CoefficientTable;
  locale: Locale;
  assetId: string;
  available: boolean;
  vatBasisPoints: number;
}) {
  const terms = [
    ...new Set(table.bands.flatMap((band) => Object.keys(band.monthly_factor_by_term).map(Number))),
  ]
    .filter((term) => term <= MAX_LEASE_TERM_MONTHS)
    .sort((a, b) => a - b);
  const [termIndex, setTermIndex] = useState(Math.max(0, terms.indexOf(36)));
  const [downPayment, setDownPayment] = useState(0);
  const term = terms[termIndex] ?? 36;
  const quote = quoteLease(table, priceCents, downPayment, term);
  const t = getT(locale);
  const gross = (cents: number) => invoiceAmounts(cents, vatBasisPoints).totalCents;
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);

  return (
    <div className="mt-5 space-y-4">
      <div>
        <label
          htmlFor="lease-term"
          className="flex flex-wrap justify-between gap-3 text-caption font-semibold"
        >
          <span>{t('product.term')}</span>
          <output htmlFor="lease-term">{t('product.months', { count: term })}</output>
        </label>
        <input
          id="lease-term"
          type="range"
          min={0}
          max={terms.length - 1}
          step={1}
          value={termIndex}
          aria-valuetext={t('product.months', { count: term })}
          onChange={(event) => setTermIndex(Number(event.target.value))}
          className="min-h-target w-full cursor-pointer accent-primary"
        />
      </div>
      <div>
        <label
          htmlFor="down-payment"
          className="flex flex-wrap justify-between gap-3 text-caption font-semibold"
        >
          <span>{t('pricing.downGross')}</span>
          <output htmlFor="down-payment">{money(gross(downPayment))}</output>
        </label>
        <input
          id="down-payment"
          type="range"
          min={0}
          max={Math.floor(priceCents / 100) * 100}
          step={100}
          value={downPayment}
          aria-valuetext={money(gross(downPayment))}
          onChange={(event) => setDownPayment(Number(event.target.value))}
          className="min-h-target w-full cursor-pointer accent-primary"
        />
      </div>
      <div
        aria-live="polite"
        aria-atomic="true"
        className="rounded-md bg-parchment p-card text-ink"
      >
        {quote.ok ? (
          <>
            <p>{t('pricing.monthlyGross')}</p>
            <p className="mt-1 font-display text-display-lg font-semibold tabular-nums">
              {money(gross(quote.monthlyNetCents))}
            </p>
            <p className="mt-3 text-caption text-ink-muted">
              {t('pricing.financedGross', { amount: money(gross(quote.financedCents)) })}
            </p>
          </>
        ) : (
          <p>{t(`product.error.${quote.reason}`)}</p>
        )}
      </div>
      <p className="text-fine text-ink-muted">{t('product.estimate')}</p>
      <AddToCart
        id={assetId}
        locale={locale}
        available={available && quote.ok}
        termMonths={term}
        downPaymentCents={downPayment}
      />
    </div>
  );
}
