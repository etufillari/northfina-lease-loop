'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { Asset, CoefficientTable, VatRates } from '@/data/schemas';
import {
  availableTermsFromTable,
  calculateContractQuote,
  clampDownPaymentCents,
  downPaymentBoundsFor,
  type ContractQuote,
} from '@/domain/contract-pricing';
import { formatEuro } from '@/domain/money';
import type { ListPriceResult } from '@/domain/price-list';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type ContractProps = {
  asset: Asset;
  price: ListPriceResult;
  coefficientTable: CoefficientTable;
  vatRates: VatRates;
  isoDate: string;
  locale: Locale;
  initialTermMonths?: number;
  initialDownPaymentCents?: number;
  defaultBreakdownOpen?: boolean;
  onClose?: () => void;
  /**
   * Set when the configurator is used to change the terms of an application in progress. The
   * Apply link is replaced by one "Use these terms" button that reports the choice.
   */
  onUseTerms?: (choice: { termMonths: number; downPaymentCents: number }) => void;
};

const DEFAULT_TERM_MONTHS = 36;

export function Contract({
  asset,
  price,
  coefficientTable,
  vatRates,
  isoDate,
  locale,
  initialTermMonths,
  initialDownPaymentCents = 0,
  defaultBreakdownOpen = false,
  onClose,
  onUseTerms,
  onSign,
}: ContractProps) {
  const router = useRouter();
  const t = getT(locale);
  const intlTag = intlLocale[locale];
  const headingId = useId();
  const termSliderId = useId();
  const downPaymentSliderId = useId();
  const breakdownPanelId = useId();

  const terms = availableTermsFromTable(coefficientTable);
  const defaultTerm =
    initialTermMonths !== undefined && terms.includes(initialTermMonths)
      ? initialTermMonths
      : terms.includes(DEFAULT_TERM_MONTHS)
        ? DEFAULT_TERM_MONTHS
        : (terms[0] ?? DEFAULT_TERM_MONTHS);

  const bounds = downPaymentBoundsFor(coefficientTable, price.ok ? price.priceCents : 0);

  const [selectedTermMonths, setSelectedTermMonths] = useState<number>(defaultTerm);
  const [rawDownPaymentCents, setRawDownPaymentCents] = useState<number>(() =>
    clampDownPaymentCents(initialDownPaymentCents, bounds)
  );
  const [isBreakdownOpen, setIsBreakdownOpen] = useState<boolean>(defaultBreakdownOpen);
  const [isReserving, setIsReserving] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const termMonths = selectedTermMonths;
  const downPaymentCents = clampDownPaymentCents(rawDownPaymentCents, bounds);
  const liveQuoteResult = price.ok
    ? calculateContractQuote({
        listPriceCents: price.priceCents,
        priceListVersion: price.priceListVersion,
        downPaymentCents,
        termMonths,
        isoDate,
        coefficientTable,
        vatRates,
      })
    : null;

  const activeQuote: ContractQuote | null = liveQuoteResult?.ok ? liveQuoteResult.quote : null;

  const isAssetAvailable = asset.status === 'available';

  const termIndex = Math.max(0, terms.indexOf(termMonths));
  const lowestMinFinancedCents = Math.min(
    ...coefficientTable.bands.map((b) => b.min_financed_cents)
  );
  const highestMaxFinancedCents = Math.max(
    ...coefficientTable.bands.map((b) => b.max_financed_cents)
  );

  async function handleApplyClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!activeQuote || isReserving) return;
    e.preventDefault();
    setIsReserving(true);
    setApplyError(null);

    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(asset.id)}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'customer' }),
      });
      const json = (await response.json()) as {
        success: boolean;
        data?: { reservation: { token: string } };
      };

      if (response.ok && json.success && json.data) {
        const token = json.data.reservation.token;
        router.push(
          `/${locale}/apply?asset=${asset.id}&term=${activeQuote.termMonths}&down=${activeQuote.downPaymentCents}&token=${encodeURIComponent(token)}`
        );
      } else if (response.status === 409) {
        setApplyError(t('apply.reservation.conflict'));
        setIsReserving(false);
      } else {
        router.push(
          `/${locale}/apply?asset=${asset.id}&term=${activeQuote.termMonths}&down=${activeQuote.downPaymentCents}`
        );
      }
    } catch {
      router.push(
        `/${locale}/apply?asset=${asset.id}&term=${activeQuote.termMonths}&down=${activeQuote.downPaymentCents}`
      );
    }
  }
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-[12px] border border-[#dad9d8] bg-[#FFFFFF] p-[24px] text-[#353331] shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100"
    >
      {/* Header: asset identity + draft/signed status */}
      <div className="flex flex-wrap items-start justify-between gap-[16px] border-b border-[#ededed] pb-[16px] dark:border-stone-800">
        <div>
          <p className="text-[0.75rem] font-semibold tracking-wider text-[#1354a5] uppercase dark:text-sky-400">
            {t('contract.eyebrow')}
          </p>
          <h2 id={headingId} className="mt-[4px] text-[1.375rem] leading-tight font-bold">
            {asset.make} {asset.model} ({asset.model_year})
          </h2>
          <p className="mt-[4px] text-[0.875rem] text-[#615b57] dark:text-stone-400">
            {t('contract.serialNumber', { serial: asset.serial_number })} · {t('condition.label')}:{' '}
            {t(`condition.${asset.condition}`)} · {t('asset.usage')}:{' '}
            {t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) })}
          </p>
        </div>

        <span className="inline-flex items-center gap-[8px] rounded-full bg-[#f6f7f8] px-[12px] py-[4px] text-[0.75rem] font-semibold text-[#123054] ring-1 ring-[#ccd7e6] ring-inset dark:bg-stone-800 dark:text-sky-200 dark:ring-stone-700">
          <span
            aria-hidden="true"
            className="size-[8px] rounded-full bg-[#2877d7] dark:bg-sky-400"
          />
          {t('contract.statusDraft')}
        </span>
      </div>

      {/* Sliders: Lease length (term) and Down payment */}
      <div className="my-[24px] grid gap-[24px] rounded-[8px] bg-[#f7f7f7] p-[16px] dark:bg-stone-800/60 dark:ring-1 dark:ring-stone-800">
        {/* Term slider */}
        <div className="grid gap-[8px]">
          <div className="flex items-baseline justify-between gap-[8px]">
            <label
              htmlFor={termSliderId}
              className="text-[0.875rem] font-semibold text-[#353331] dark:text-stone-200"
            >
              {t('contract.termLabel')}
            </label>
            <output
              htmlFor={termSliderId}
              className="font-mono text-[0.875rem] font-semibold text-[#1354a5] tabular-nums dark:text-sky-400"
            >
              {t('contract.termValue', { months: termMonths })}
            </output>
          </div>

          <input
            id={termSliderId}
            type="range"
            min={0}
            max={Math.max(0, terms.length - 1)}
            step={1}
            value={termIndex}
            disabled={terms.length <= 1}
            aria-valuetext={t('contract.termValue', { months: termMonths })}
            onChange={(event) => {
              const nextTerm = terms[Number(event.target.value)];
              if (nextTerm !== undefined) {
                setSelectedTermMonths(nextTerm);
              }
            }}
            className="h-[8px] w-full cursor-pointer accent-[#1a65c1] disabled:cursor-not-allowed disabled:opacity-60"
          />

          <div className="flex justify-between gap-[8px]">
            {terms.map((months) => {
              const isSelected = months === termMonths;
              return (
                <button
                  key={months}
                  type="button"
                  onClick={() => setSelectedTermMonths(months)}
                  className={`rounded-[4px] px-[8px] py-[4px] text-[0.75rem] font-medium transition-colors ${
                    isSelected
                      ? 'bg-[#1a65c1] text-[#FFFFFF] dark:bg-sky-600'
                      : 'text-[#615b57] hover:bg-[#ededed] disabled:hover:bg-transparent dark:text-stone-400 dark:hover:bg-stone-700'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {t('contract.termTick', { months })}
                </button>
              );
            })}
          </div>
        </div>

        {/* Down payment slider */}
        <div className="grid gap-[8px]">
          <div className="flex items-baseline justify-between gap-[8px]">
            <label
              htmlFor={downPaymentSliderId}
              className="text-[0.875rem] font-semibold text-[#353331] dark:text-stone-200"
            >
              {t('contract.downPaymentLabel')}
            </label>
            <output
              htmlFor={downPaymentSliderId}
              className="font-mono text-[0.875rem] font-semibold text-[#1354a5] tabular-nums dark:text-sky-400"
            >
              {formatEuro(downPaymentCents, intlTag)}
            </output>
          </div>

          <input
            id={downPaymentSliderId}
            type="range"
            min={bounds.minCents}
            max={bounds.maxCents}
            step={bounds.stepCents}
            value={downPaymentCents}
            disabled={!price.ok || bounds.maxCents === 0}
            aria-valuetext={formatEuro(downPaymentCents, intlTag)}
            onChange={(event) => {
              setRawDownPaymentCents(Number(event.target.value));
            }}
            className="h-[8px] w-full cursor-pointer accent-[#1a65c1] disabled:cursor-not-allowed disabled:opacity-60"
          />

          <div className="flex justify-between text-[0.75rem] text-[#615b57] tabular-nums dark:text-stone-400">
            <span>
              {t('contract.downPaymentRange', {
                min: formatEuro(bounds.minCents, intlTag),
                max: formatEuro(bounds.maxCents, intlTag),
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Validation / status warnings */}
      {!price.ok ? (
        <div
          role="alert"
          className="mb-[16px] rounded-[8px] border border-[#e9dac8] bg-[#f8f7f6] p-[16px] text-[0.875rem] text-[#5c360a] dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {t('contract.errorNoPrice', { date: formatIsoDate(isoDate, locale) })}
        </div>
      ) : null}

      {!isAssetAvailable ? (
        <div
          role="alert"
          className="mb-[16px] rounded-[8px] border border-[#e9dac8] bg-[#f8f7f6] p-[16px] text-[0.875rem] text-[#5c360a] dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {t('contract.errorUnavailable', { status: t(`status.${asset.status}`) })}
        </div>
      ) : null}

      {price.ok && liveQuoteResult && !liveQuoteResult.ok ? (
        <div
          role="alert"
          className="mb-[16px] rounded-[8px] border border-[#DC2626] bg-[#f8f7f6] p-[16px] text-[0.875rem] text-[#DC2626] dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
        >
          {liveQuoteResult.reason === 'below_minimum'
            ? t('contract.errorBelowMinimum', {
                amount: formatEuro(liveQuoteResult.financedCents, intlTag),
                min: formatEuro(lowestMinFinancedCents, intlTag),
              })
            : liveQuoteResult.reason === 'above_maximum'
              ? t('contract.errorAboveMaximum', {
                  amount: formatEuro(liveQuoteResult.financedCents, intlTag),
                  max: formatEuro(highestMaxFinancedCents, intlTag),
                })
              : t('contract.errorInvalidQuote')}
        </div>
      ) : null}

      {/* Monthly payment headline + collapsible financial breakdown */}
      {activeQuote ? (
        <div className="grid gap-[16px]">
          {/* Monthly gross rent banner + price lock explanation (always visible) */}
          <div className="flex flex-wrap items-center justify-between gap-[16px] rounded-[8px] border border-[#ccd7e6] bg-[#f6f7f8] p-[16px] dark:border-sky-950 dark:bg-stone-800/80">
            <div className="max-w-md">
              <p className="text-[0.875rem] font-semibold text-[#123054] dark:text-sky-300">
                {t('contract.monthlyGrossRent')}
              </p>
              <p className="mt-[4px] text-[0.75rem] text-[#615b57] dark:text-stone-400">
                {t('contract.priceLockNote', {
                  netRent: formatEuro(activeQuote.monthlyNetRentCents, intlTag),
                  date: formatIsoDate(activeQuote.isoDate, locale),
                })}
              </p>
            </div>
            <p className="font-mono text-[1.75rem] leading-none font-bold text-[#123054] tabular-nums dark:text-sky-200">
              {formatEuro(activeQuote.monthlyGrossRentCents, intlTag)}
            </p>
          </div>

          {/* Collapsible breakdown */}
          <div className="overflow-hidden rounded-[8px] border border-[#dad9d8] bg-[#FFFFFF] dark:border-stone-800 dark:bg-stone-900">
            <button
              type="button"
              aria-expanded={isBreakdownOpen}
              aria-controls={breakdownPanelId}
              onClick={() => setIsBreakdownOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-[12px] bg-[#f7f7f7] px-[16px] py-[12px] text-left text-[0.875rem] font-semibold text-[#353331] transition-colors hover:bg-[#ededed] dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700/80"
            >
              <span>{t('contract.breakdownTitle')}</span>
              <span className="inline-flex items-center gap-[8px] text-[0.75rem] font-semibold text-[#1354a5] dark:text-sky-400">
                <span>
                  {isBreakdownOpen ? t('contract.hideBreakdown') : t('contract.showBreakdown')}
                </span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  className={`size-[16px] shrink-0 transition-transform ${
                    isBreakdownOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </span>
            </button>

            {isBreakdownOpen ? (
              <dl
                id={breakdownPanelId}
                className="grid grid-cols-1 gap-x-[24px] gap-y-[12px] border-t border-[#ededed] p-[16px] text-[0.875rem] sm:grid-cols-2 dark:border-stone-800"
              >
                <BreakdownRow
                  label={t('contract.listPrice', { version: activeQuote.priceListVersion })}
                  value={formatEuro(activeQuote.listPriceCents, intlTag)}
                />
                <BreakdownRow
                  label={t('contract.bandLabel')}
                  value={t('contract.bandAndFactor', {
                    band: activeQuote.band.band,
                    interest: activeQuote.band.annual_interest_percent,
                    factor: activeQuote.factor.toFixed(6),
                  })}
                />
                <BreakdownRow
                  label={t('contract.downPayment')}
                  value={formatEuro(activeQuote.downPaymentCents, intlTag)}
                />
                <BreakdownRow
                  label={t('contract.monthlyNetRent')}
                  value={formatEuro(activeQuote.monthlyNetRentCents, intlTag)}
                />
                <BreakdownRow
                  label={t('contract.financedAmount')}
                  value={formatEuro(activeQuote.financedCents, intlTag)}
                />
                <BreakdownRow
                  label={t('contract.monthlyVat', { rate: activeQuote.vatRatePercent })}
                  value={formatEuro(activeQuote.monthlyVatCents, intlTag)}
                />
                <BreakdownRow
                  label={t('contract.buyoutOption', { percent: activeQuote.buyoutPercent })}
                  value={formatEuro(activeQuote.buyoutNetCents, intlTag)}
                />
                <BreakdownRow
                  label={t('contract.totalRentNet', { months: activeQuote.termMonths })}
                  value={formatEuro(activeQuote.totalRentNetCents, intlTag)}
                />
                <BreakdownRow
                  label={t('contract.totalLeaseNet')}
                  value={formatEuro(activeQuote.totalLeaseNetCents, intlTag)}
                />
                <BreakdownRow
                  label={t('contract.totalWithBuyoutNet')}
                  value={formatEuro(activeQuote.totalWithBuyoutNetCents, intlTag)}
                />
              </dl>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Actions */}
      <div className="mt-[24px] flex flex-wrap items-center justify-end gap-[12px]">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] border border-[#bfbcbb] bg-transparent px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#353331] transition-colors hover:bg-[#f7f7f7] dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {t('contract.hideButton')}
          </button>
        ) : null}

        {onUseTerms ? (
          <button
            type="button"
            disabled={!activeQuote}
            onClick={() =>
              activeQuote &&
              onUseTerms({
                termMonths: activeQuote.termMonths,
                downPaymentCents: activeQuote.downPaymentCents,
              })
            }
            className="rounded-[8px] bg-[#1a65c1] px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#FFFFFF] transition-colors hover:bg-[#1354a5] disabled:cursor-not-allowed disabled:bg-[#857f7a] dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-stone-700 dark:disabled:text-stone-400"
          >
            {t('apply.useTerms')}
          </button>
        ) : null}

        {applyError ? (
          <p
            role="alert"
            className="w-full text-right text-[0.875rem] font-semibold text-[#DC2626] dark:text-red-400"
          >
            {applyError}
          </p>
        ) : null}

        {/* Spine step 3: the application carries the chosen term and net down payment. */}
        {!onUseTerms ? (
          isAssetAvailable && activeQuote ? (
            <Link
              href={`/${locale}/apply?asset=${asset.id}&term=${activeQuote.termMonths}&down=${activeQuote.downPaymentCents}`}
              onClick={handleApplyClick}
              className="rounded-[8px] bg-[#1a65c1] px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#FFFFFF] transition-colors hover:bg-[#1354a5] dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              {isReserving ? t('apply.checking') : t('contract.applyButton')}
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="rounded-[8px] bg-[#857f7a] px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#FFFFFF] opacity-60 cursor-not-allowed dark:bg-stone-700 dark:text-stone-400"
            >
              {t('contract.applyButton')}
            </button>
          )
        ) : null}
      </div>
    </section>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-[12px]">
      <dt className="text-[#615b57] dark:text-stone-400">{label}</dt>
      <dd className="font-mono font-semibold text-[#353331] tabular-nums dark:text-stone-200">
        {value}
      </dd>
    </div>
  );
}

export { ContractDrawerTrigger, type ContractDrawerTriggerProps } from './contract-drawer';

export default Contract;
