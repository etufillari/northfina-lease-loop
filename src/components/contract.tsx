'use client';

import { useEffect, useId, useState } from 'react';
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

export type SignedContract = {
  assetId: string;
  signedOn: string;
  quote: ContractQuote;
};

export type ContractProps = {
  asset: Asset;
  price: ListPriceResult;
  coefficientTable: CoefficientTable;
  vatRates: VatRates;
  isoDate: string;
  locale: Locale;
  initialTermMonths?: number;
  initialDownPaymentCents?: number;
  initialSignedContract?: SignedContract | null;
  onSign?: (signed: SignedContract) => void;
  onClose?: () => void;
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
  initialSignedContract = null,
  onSign,
  onClose,
}: ContractProps) {
  const t = getT(locale);
  const intlTag = intlLocale[locale];
  const headingId = useId();
  const termSliderId = useId();
  const downPaymentSliderId = useId();

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
  const [signedContract, setSignedContract] = useState<SignedContract | null>(
    initialSignedContract
  );

  const isSigned = signedContract !== null;
  const termMonths = isSigned ? signedContract.quote.termMonths : selectedTermMonths;
  const downPaymentCents = isSigned
    ? signedContract.quote.downPaymentCents
    : clampDownPaymentCents(rawDownPaymentCents, bounds);

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

  const activeQuote: ContractQuote | null = isSigned
    ? signedContract.quote
    : liveQuoteResult?.ok
      ? liveQuoteResult.quote
      : null;

  const isAssetAvailable = asset.status === 'available';
  const canSign = !isSigned && isAssetAvailable && price.ok && liveQuoteResult?.ok === true;

  const termIndex = Math.max(0, terms.indexOf(termMonths));
  const lowestMinFinancedCents = Math.min(
    ...coefficientTable.bands.map((b) => b.min_financed_cents)
  );
  const highestMaxFinancedCents = Math.max(
    ...coefficientTable.bands.map((b) => b.max_financed_cents)
  );

  function handleSign() {
    if (!canSign || !activeQuote) return;
    const signed: SignedContract = {
      assetId: asset.id,
      signedOn: isoDate,
      quote: activeQuote,
    };
    setSignedContract(signed);
    onSign?.(signed);
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-[12px] border border-[#dad9d8] bg-[#FFFFFF] p-[24px] text-[#353331] shadow-sm"
    >
      {/* Header: asset identity + draft/signed status */}
      <div className="flex flex-wrap items-start justify-between gap-[16px] border-b border-[#ededed] pb-[16px]">
        <div>
          <p className="text-[0.75rem] font-semibold tracking-wider text-[#1354a5] uppercase">
            {t('contract.eyebrow')}
          </p>
          <h2 id={headingId} className="mt-[4px] text-[1.375rem] leading-tight font-bold">
            {asset.make} {asset.model} ({asset.model_year})
          </h2>
          <p className="mt-[4px] text-[0.875rem] text-[#615b57]">
            {t('contract.serialNumber', { serial: asset.serial_number })} · {t('condition.label')}:{' '}
            {t(`condition.${asset.condition}`)} · {t('asset.usage')}:{' '}
            {t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) })}
          </p>
        </div>

        <span
          className={`inline-flex items-center gap-[8px] rounded-full px-[12px] py-[4px] text-[0.75rem] font-semibold ring-1 ring-inset ${
            isSigned
              ? 'bg-[#eaf0ec] text-[#14522a] ring-[#cde5d5]'
              : 'bg-[#f6f7f8] text-[#123054] ring-[#ccd7e6]'
          }`}
        >
          <span
            aria-hidden="true"
            className={`size-[8px] rounded-full ${isSigned ? 'bg-[#16A34A]' : 'bg-[#2877d7]'}`}
          />
          {isSigned ? t('contract.statusSigned') : t('contract.statusDraft')}
        </span>
      </div>

      {/* Sliders: Lease length (term) and Down payment */}
      <div className="my-[24px] grid gap-[24px] rounded-[8px] bg-[#f7f7f7] p-[16px]">
        {/* Term slider */}
        <div className="grid gap-[8px]">
          <div className="flex items-baseline justify-between gap-[8px]">
            <label htmlFor={termSliderId} className="text-[0.875rem] font-semibold text-[#353331]">
              {t('contract.termLabel')}
            </label>
            <output
              htmlFor={termSliderId}
              className="font-mono text-[0.875rem] font-semibold text-[#1354a5] tabular-nums"
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
            disabled={isSigned || terms.length <= 1}
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
                  disabled={isSigned}
                  onClick={() => setSelectedTermMonths(months)}
                  className={`rounded-[4px] px-[8px] py-[4px] text-[0.75rem] font-medium transition-colors ${
                    isSelected
                      ? 'bg-[#1a65c1] text-[#FFFFFF]'
                      : 'text-[#615b57] hover:bg-[#ededed] disabled:hover:bg-transparent'
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
              className="text-[0.875rem] font-semibold text-[#353331]"
            >
              {t('contract.downPaymentLabel')}
            </label>
            <output
              htmlFor={downPaymentSliderId}
              className="font-mono text-[0.875rem] font-semibold text-[#1354a5] tabular-nums"
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
            disabled={isSigned || !price.ok || bounds.maxCents === 0}
            aria-valuetext={formatEuro(downPaymentCents, intlTag)}
            onChange={(event) => {
              setRawDownPaymentCents(Number(event.target.value));
            }}
            className="h-[8px] w-full cursor-pointer accent-[#1a65c1] disabled:cursor-not-allowed disabled:opacity-60"
          />

          <div className="flex justify-between text-[0.75rem] text-[#615b57] tabular-nums">
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
          className="mb-[16px] rounded-[8px] border border-[#e9dac8] bg-[#f8f7f6] p-[16px] text-[0.875rem] text-[#5c360a]"
        >
          {t('contract.errorNoPrice', { date: formatIsoDate(isoDate, locale) })}
        </div>
      ) : null}

      {!isAssetAvailable ? (
        <div
          role="alert"
          className="mb-[16px] rounded-[8px] border border-[#e9dac8] bg-[#f8f7f6] p-[16px] text-[0.875rem] text-[#5c360a]"
        >
          {t('contract.errorUnavailable', { status: t(`status.${asset.status}`) })}
        </div>
      ) : null}

      {price.ok && liveQuoteResult && !liveQuoteResult.ok ? (
        <div
          role="alert"
          className="mb-[16px] rounded-[8px] border border-[#DC2626] bg-[#f8f7f6] p-[16px] text-[0.875rem] text-[#DC2626]"
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

      {/* Full financial breakdown */}
      {activeQuote ? (
        <div>
          <h3 className="text-[0.875rem] font-semibold text-[#353331]">
            {t('contract.breakdownTitle')}
          </h3>

          <dl className="mt-[12px] grid grid-cols-1 gap-x-[24px] gap-y-[12px] border-y border-[#ededed] py-[16px] text-[0.875rem] sm:grid-cols-2">
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

          {/* Monthly gross rent banner + price lock explanation */}
          <div className="mt-[16px] flex flex-wrap items-center justify-between gap-[16px] rounded-[8px] border border-[#ccd7e6] bg-[#f6f7f8] p-[16px]">
            <div className="max-w-md">
              <p className="text-[0.875rem] font-semibold text-[#123054]">
                {t('contract.monthlyGrossRent')}
              </p>
              <p className="mt-[4px] text-[0.75rem] text-[#615b57]">
                {t('contract.priceLockNote', {
                  netRent: formatEuro(activeQuote.monthlyNetRentCents, intlTag),
                  date: formatIsoDate(activeQuote.isoDate, locale),
                })}
              </p>
            </div>
            <p className="font-mono text-[1.75rem] leading-none font-bold text-[#123054] tabular-nums">
              {formatEuro(activeQuote.monthlyGrossRentCents, intlTag)}
            </p>
          </div>
        </div>
      ) : null}

      {/* Signed confirmation state */}
      {signedContract ? (
        <div
          role="status"
          className="mt-[16px] rounded-[8px] border border-[#cde5d5] bg-[#eaf0ec] p-[16px] text-[#14522a]"
        >
          <p className="text-[0.875rem] font-semibold">
            {t('contract.signedBannerTitle', {
              date: formatIsoDate(signedContract.signedOn, locale),
            })}
          </p>
          <p className="mt-[4px] text-[0.875rem]">
            {t('contract.signedBannerBody', {
              netRent: formatEuro(signedContract.quote.monthlyNetRentCents, intlTag),
              version: signedContract.quote.priceListVersion,
              months: signedContract.quote.termMonths,
              downPayment: formatEuro(signedContract.quote.downPaymentCents, intlTag),
            })}
          </p>
        </div>
      ) : null}

      {/* Actions */}
      <div className="mt-[24px] flex flex-wrap items-center justify-end gap-[12px]">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] border border-[#bfbcbb] bg-transparent px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#353331] transition-colors hover:bg-[#f7f7f7]"
          >
            {t('contract.hideButton')}
          </button>
        ) : null}

        <button
          type="button"
          disabled={!canSign}
          onClick={handleSign}
          className="rounded-[8px] bg-[#1a65c1] px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#FFFFFF] transition-colors hover:bg-[#1354a5] disabled:cursor-not-allowed disabled:bg-[#857f7a]"
        >
          {isSigned ? t('contract.signedButton') : t('contract.signButton')}
        </button>
      </div>
    </section>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-[12px]">
      <dt className="text-[#615b57]">{label}</dt>
      <dd className="font-mono font-semibold text-[#353331] tabular-nums">{value}</dd>
    </div>
  );
}

export type ContractDrawerTriggerProps = Omit<ContractProps, 'onClose'>;

/**
 * Interactive button + modal/panel trigger for opening `Contract` from a catalogue card.
 */
export function ContractDrawerTrigger(props: ContractDrawerTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [signedContract, setSignedContract] = useState<SignedContract | null>(
    props.initialSignedContract ?? null
  );
  const t = getT(props.locale);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className="mt-[16px]">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className={`w-full rounded-[8px] px-[16px] py-[8px] text-[0.875rem] font-semibold transition-colors ${
          signedContract
            ? 'border border-[#cde5d5] bg-[#eaf0ec] text-[#14522a]'
            : isOpen
              ? 'border border-[#bfbcbb] bg-transparent text-[#353331] hover:bg-[#f7f7f7]'
              : 'bg-[#1a65c1] text-[#FFFFFF] hover:bg-[#1354a5]'
        }`}
      >
        {signedContract
          ? t('contract.statusSigned')
          : isOpen
            ? t('contract.hideButton')
            : t('contract.openButton')}
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${props.asset.make} ${props.asset.model}`}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#353331]/60 p-[16px]"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <div className="my-auto max-h-[92dvh] w-full max-w-2xl overflow-y-auto">
            <Contract
              {...props}
              initialSignedContract={signedContract}
              onSign={(signed) => {
                setSignedContract(signed);
                props.onSign?.(signed);
              }}
              onClose={() => setIsOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Contract;
