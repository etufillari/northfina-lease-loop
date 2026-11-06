'use client';

import { useEffect, useState } from 'react';

import type { Locale } from '@/i18n/locales';
import type { Translate } from '@/i18n/get-t';

import { formatEuro } from '@/domain/money';
import { intlLocale } from '@/i18n/locales';

import { ApplyForLeasingCta } from '@/components/apply-for-leasing-cta';

type AssetQuotePanelProps = {
  assetId: string;
  available: boolean;
  locale: Locale;
  t: Translate;
  onPriceChange: (cents: number | null) => void;
};

type DownPaymentLimits = {
  min_cents: number;
  max_cents: number;
};

type AssetQuote = {
  base_price_cents: number;
  quote_date: string;
  vat_rate_percent: number;
  monthly_vat_cents: number;
  monthly_total_cents: number;
  monthly_net_rent_cents: number;
  financed_cents: number;
  buyout_cents: number;
  total_if_returned_cents: number;
  total_if_bought_cents: number;
  down_payment_limits: DownPaymentLimits;
};

type ApiSuccess<T> = {
  success: true;
  data: T;
  meta: {
    timestamp: string;
  };
};

type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: {
      reason?: string;
      down_payment_limits?: DownPaymentLimits | null;
    };
  };
};

type ApiResponse<T> = ApiSuccess<T> | ApiError;

const MIN_TERM = 12;
const MAX_TERM = 48;
const TERM_STEP = 12;

function clampDownPayment(value: number, limits: DownPaymentLimits) {
  return Math.min(limits.max_cents, Math.max(limits.min_cents, value));
}

export function AssetQuotePanel({
  assetId,
  available,
  locale,
  t,
  onPriceChange,
}: AssetQuotePanelProps) {
  const [term, setTerm] = useState(36);
  const [downPayment, setDownPayment] = useState(0);

  const [quote, setQuote] = useState<AssetQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [downPaymentLimits, setDownPaymentLimits] = useState<DownPaymentLimits | null>(null);

  const formatMoney = (cents: number) => formatEuro(cents, intlLocale[locale]);

  useEffect(() => {
    if (!available) {
      onPriceChange(null);
      return;
    }

    const controller = new AbortController();

    const timeout = window.setTimeout(async () => {
      try {
        setLoadingQuote(true);
        setQuote(null);
        setQuoteError(null);

        const query = new URLSearchParams({
          term: String(term),
          down: String(downPayment),
        });

        const response = await fetch(`/api/assets/${assetId}/quote?${query.toString()}`, {
          signal: controller.signal,
        });

        const body = (await response.json()) as ApiResponse<AssetQuote>;

        if (!response.ok || !body.success) {
          if (!body.success) {
            const limits = body.error.details?.down_payment_limits ?? null;

            if (limits) {
              setDownPaymentLimits(limits);

              const adjustedDownPayment = clampDownPayment(downPayment, limits);

              if (adjustedDownPayment !== downPayment) {
                setDownPayment(adjustedDownPayment);
                return;
              }
            }

            throw new Error(body.error.message);
          }

          throw new Error(t('asset.quoteUnavailable'));
        }

        const limits = body.data.down_payment_limits;

        setDownPaymentLimits(limits);

        const adjustedDownPayment = clampDownPayment(downPayment, limits);

        if (adjustedDownPayment !== downPayment) {
          setDownPayment(adjustedDownPayment);
          return;
        }

        setQuote(body.data);
        onPriceChange(body.data.base_price_cents);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        setQuote(null);
        onPriceChange(null);

        setQuoteError(error instanceof Error ? error.message : t('asset.quoteUnavailable'));
      } finally {
        if (!controller.signal.aborted) {
          setLoadingQuote(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [assetId, available, term, downPayment, onPriceChange, t]);

  return (
    <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-6">
      <h2 className="text-xl font-semibold">{t('asset.estimatedLeasePrice')}</h2>

      {!available ? (
        <div className="mt-6 rounded-xl bg-stone-50 px-4 py-4 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          {t('asset.unavailableForLeasing')}
        </div>
      ) : (
        <>
          {/* Lease term */}
          <div className="mt-7">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="term"
                className="text-sm font-medium text-stone-700 dark:text-stone-300"
              >
                {t('asset.leaseTerm')}
              </label>

              <span className="font-semibold tabular-nums">
                {term} {t('asset.month')}
              </span>
            </div>

            <input
              id="term"
              type="range"
              min={MIN_TERM}
              max={MAX_TERM}
              step={TERM_STEP}
              value={term}
              onChange={(event) => setTerm(Number(event.target.value))}
              className="mt-4 w-full cursor-pointer accent-emerald-600"
            />

            <div className="mt-2 flex justify-between text-xs text-stone-500 dark:text-stone-400">
              <span>12</span>
              <span>24</span>
              <span>36</span>
              <span>48</span>
            </div>
          </div>

          {/* Down payment */}
          <div className="mt-7">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="down-payment"
                className="text-sm font-medium text-stone-700 dark:text-stone-300"
              >
                {t('asset.downPayment')}
              </label>

              <span className="font-semibold tabular-nums">{formatMoney(downPayment)}</span>
            </div>

            <input
              id="down-payment"
              type="range"
              min={downPaymentLimits?.min_cents ?? 0}
              max={Math.max(downPaymentLimits?.max_cents ?? 0, downPaymentLimits?.min_cents ?? 0)}
              step={100}
              value={downPayment}
              onChange={(event) => setDownPayment(Number(event.target.value))}
              disabled={!downPaymentLimits}
              className="mt-4 w-full cursor-pointer accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
            />

            {downPaymentLimits && (
              <div className="mt-2 flex justify-between text-xs text-stone-500 dark:text-stone-400">
                <span>{formatMoney(downPaymentLimits.min_cents)}</span>
                <span>{formatMoney(downPaymentLimits.max_cents)}</span>
              </div>
            )}
          </div>

          {/* Quote result */}
          <div className="mt-8 rounded-xl bg-stone-50 p-4 dark:bg-stone-800/60 sm:p-5">
            {loadingQuote ? (
              <p className="text-sm text-stone-500 dark:text-stone-400">
                {t('asset.updatingQuote')}
              </p>
            ) : quote ? (
              <>
                <p className="text-xs text-stone-600 dark:text-stone-400">
                  {t('asset.monthlyPaymentIncludingVat')}
                </p>

                <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
                  {formatMoney(quote.monthly_total_cents)}
                  <span className="ml-1 text-sm font-normal text-stone-500 dark:text-stone-400">
                    / {t('asset.month')}
                  </span>
                </p>

                <div className="mt-5 space-y-3 border-t border-stone-200 pt-4 text-sm dark:border-stone-700">
                  <QuoteFact
                    label={t('asset.netMonthlyRent')}
                    value={formatMoney(quote.monthly_net_rent_cents)}
                  />

                  <QuoteFact
                    label={`${t('asset.vat')} (${quote.vat_rate_percent}%)`}
                    value={formatMoney(quote.monthly_vat_cents)}
                  />

                  <QuoteFact label={t('asset.price')} value={formatMoney(quote.base_price_cents)} />

                  <QuoteFact
                    label={t('asset.totalFinanced')}
                    value={formatMoney(quote.financed_cents)}
                  />

                  <QuoteFact label={t('asset.buyout')} value={formatMoney(quote.buyout_cents)} />
                </div>

                <div className="mt-5 space-y-3 border-t border-stone-200 pt-4 text-sm dark:border-stone-700">
                  <QuoteFact
                    label={t('asset.totalIfReturned')}
                    value={formatMoney(quote.total_if_returned_cents)}
                  />

                  <QuoteFact
                    label={t('asset.totalIfBought')}
                    value={formatMoney(quote.total_if_bought_cents)}
                    strong
                  />
                </div>

                <p className="mt-5 text-xs text-stone-500 dark:text-stone-400">
                  {t('asset.quoteDate')}: {quote.quote_date}
                </p>
              </>
            ) : (
              <p className="text-sm text-red-600 dark:text-red-400">
                {quoteError ?? t('asset.quoteUnavailable')}
              </p>
            )}
          </div>

          {quote && !loadingQuote && <ApplyForLeasingCta assetId={assetId} locale={locale} t={t} />}
        </>
      )}
    </aside>
  );
}

function QuoteFact({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="min-w-0 text-stone-600 dark:text-stone-400">{label}</span>

      <span
        className={`shrink-0 text-right tabular-nums ${
          strong ? 'font-semibold text-stone-900 dark:text-stone-100' : 'font-medium'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
