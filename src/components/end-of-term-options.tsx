'use client';

import { useEffect, useId, useState } from 'react';
import type { AssetCategory, AssetCondition, AssetStatus } from '@/data/schemas';
import type { BuyoutSettlement, WaitingListMatch } from '@/domain/end-of-term';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type EndOfTermOptionsProps = {
  assetId: string;
  assetCategory: AssetCategory;
  assetCondition: AssetCondition;
  assetName: string;
  initialStatus: AssetStatus;
  locale: Locale;
  buyoutSettlement: BuyoutSettlement;
  waitingListMatches: WaitingListMatch[];
  avoidedCo2Kg: number;
};

type ActiveModal = 'buy' | 'return' | 'pass_on' | null;

export function EndOfTermOptions({
  assetId,
  assetName,
  initialStatus,
  locale,
  buyoutSettlement,
  waitingListMatches,
  avoidedCo2Kg,
}: EndOfTermOptionsProps) {
  const t = getT(locale);
  const intlTag = intlLocale[locale];

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [currentStatus, setCurrentStatus] = useState<AssetStatus>(initialStatus);
  const [resolutionMessage, setResolutionMessage] = useState<string | null>(() => {
    if (initialStatus === 'sold') return t('invoices.endOfTerm.buy.successMessage');
    if (initialStatus === 'returned') return t('invoices.endOfTerm.return.successMessage');
    return null;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isResolved = currentStatus === 'sold' || currentStatus === 'returned';
  const topMatch = waitingListMatches[0];

  async function handleResolve(action: 'buyout' | 'return' | 'pass_on') {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/resolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          actor: 'customer',
          details: {
            buyoutGrossCents: buyoutSettlement.grossCents,
            matchedWaitlistId: topMatch?.request.id,
            avoidedCo2Kg,
          },
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to record resolution');
      }

      const json = await res.json();
      setCurrentStatus(json.data.status);

      if (action === 'buyout') {
        setResolutionMessage(t('invoices.endOfTerm.buy.successMessage'));
      } else if (action === 'return') {
        setResolutionMessage(t('invoices.endOfTerm.return.successMessage'));
      } else {
        setResolutionMessage(t('invoices.endOfTerm.passOn.successMessage', { co2: avoidedCo2Kg }));
      }
      setActiveModal(null);
    } catch {
      setError(t('apply.error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="end-of-term-heading"
      className="rounded-[12px] border border-[#dad9d8] bg-[#FFFFFF] p-[24px] text-[#353331] shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100"
    >
      <div className="border-b border-[#ededed] pb-[16px] dark:border-stone-800">
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <div>
            <p className="text-[0.75rem] font-semibold tracking-wider text-[#1354a5] uppercase dark:text-sky-400">
              {t('apply.deal.term')}
            </p>
            <h2 id="end-of-term-heading" className="text-[1.375rem] leading-tight font-bold">
              {t('invoices.endOfTerm.heading')}
            </h2>
          </div>
          {isResolved && (
            <span className="inline-flex items-center gap-[6px] rounded-full bg-[#eaf0ec] px-[10px] py-[4px] text-[0.75rem] font-semibold text-[#14522a] ring-1 ring-[#cde5d5] ring-inset dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <span className="size-[8px] rounded-full bg-[#16A34A] dark:bg-emerald-400" />
              {t(`status.${currentStatus}`)}
            </span>
          )}
        </div>
        <p className="mt-[4px] text-[0.875rem] text-[#615b57] dark:text-stone-400">
          {t('invoices.endOfTerm.subheading')}
        </p>
      </div>

      {resolutionMessage && (
        <div
          role="status"
          className="mt-[16px] rounded-[8px] border border-[#cde5d5] bg-[#eaf0ec] p-[16px] text-[#14522a] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          <p className="text-[0.875rem] font-semibold">
            {t('invoices.endOfTerm.resolutionBannerTitle')}
          </p>
          <p className="mt-[4px] text-[0.875rem]">{resolutionMessage}</p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-[16px] rounded-[8px] border border-red-200 bg-red-50 p-[12px] text-[0.875rem] text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      <div className="mt-[24px] grid grid-cols-1 gap-[20px] md:grid-cols-3">
        {/* Option 1: Buy it */}
        <div className="flex flex-col justify-between rounded-[8px] border border-[#dad9d8] bg-[#f7f7f7] p-[20px] transition-all hover:border-[#2877d7] dark:border-stone-800 dark:bg-stone-900/60 dark:hover:border-sky-500">
          <div>
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-[#ccd7e6] px-[8px] py-[2px] text-[0.75rem] font-semibold text-[#123054] dark:bg-sky-950 dark:text-sky-300">
                {t('invoices.endOfTerm.buy.badge')}
              </span>
              <span className="font-mono text-[0.875rem] font-bold text-[#1354a5] tabular-nums dark:text-sky-400">
                {formatEuro(buyoutSettlement.grossCents, intlTag)}
              </span>
            </div>
            <h3 className="mt-[12px] text-[1.125rem] font-bold text-[#353331] dark:text-stone-100">
              {t('invoices.endOfTerm.buy.title')}
            </h3>
            <p className="mt-[6px] text-[0.875rem] text-[#615b57] dark:text-stone-400">
              {t('invoices.endOfTerm.buy.description')}
            </p>
          </div>

          <div className="mt-[20px] pt-[12px]">
            <button
              type="button"
              disabled={isResolved || isSubmitting}
              onClick={() => setActiveModal('buy')}
              className="w-full rounded-[8px] bg-[#1a65c1] px-[16px] py-[10px] text-center text-[0.875rem] font-semibold text-white transition-colors hover:bg-[#1354a5] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              {t('invoices.endOfTerm.buy.action', {
                amount: formatEuro(buyoutSettlement.grossCents, intlTag),
              })}
            </button>
          </div>
        </div>

        {/* Option 2: Return it */}
        <div className="flex flex-col justify-between rounded-[8px] border border-[#dad9d8] bg-[#f7f7f7] p-[20px] transition-all hover:border-[#2877d7] dark:border-stone-800 dark:bg-stone-900/60 dark:hover:border-sky-500">
          <div>
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-[#ededed] px-[8px] py-[2px] text-[0.75rem] font-semibold text-[#615b57] dark:bg-stone-800 dark:text-stone-300">
                {t('invoices.endOfTerm.return.badge')}
              </span>
            </div>
            <h3 className="mt-[12px] text-[1.125rem] font-bold text-[#353331] dark:text-stone-100">
              {t('invoices.endOfTerm.return.title')}
            </h3>
            <p className="mt-[6px] text-[0.875rem] text-[#615b57] dark:text-stone-400">
              {t('invoices.endOfTerm.return.description')}
            </p>
          </div>

          <div className="mt-[20px] pt-[12px]">
            <button
              type="button"
              disabled={isResolved || isSubmitting}
              onClick={() => setActiveModal('return')}
              className="w-full rounded-[8px] border border-[#bfbcbb] bg-transparent px-[16px] py-[10px] text-center text-[0.875rem] font-semibold text-[#353331] transition-colors hover:bg-[#ededed] disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              {t('invoices.endOfTerm.return.action')}
            </button>
          </div>
        </div>

        {/* Option 3: Pass your lease on */}
        <div className="flex flex-col justify-between rounded-[8px] border border-[#cde5d5] bg-[#f7f8f7] p-[20px] transition-all hover:border-[#16A34A] dark:border-emerald-800 dark:bg-emerald-950/20 dark:hover:border-emerald-500">
          <div>
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-[#cde5d5] px-[8px] py-[2px] text-[0.75rem] font-semibold text-[#14522a] dark:bg-emerald-950 dark:text-emerald-300">
                {t('invoices.endOfTerm.passOn.badge')}
              </span>
              <span className="rounded-full bg-[#eaf0ec] px-[8px] py-[2px] text-[0.75rem] font-bold text-[#16A34A] dark:bg-emerald-900/60 dark:text-emerald-300">
                +{avoidedCo2Kg} kg CO₂
              </span>
            </div>
            <h3 className="mt-[12px] text-[1.125rem] font-bold text-[#14522a] dark:text-emerald-200">
              {t('invoices.endOfTerm.passOn.title')}
            </h3>
            <p className="mt-[6px] text-[0.875rem] text-[#615b57] dark:text-stone-400">
              {t('invoices.endOfTerm.passOn.description')}
            </p>
          </div>

          <div className="mt-[20px] pt-[12px]">
            <button
              type="button"
              disabled={isResolved || isSubmitting}
              onClick={() => setActiveModal('pass_on')}
              className="w-full rounded-[8px] bg-[#2ed167] px-[16px] py-[10px] text-center text-[0.875rem] font-bold text-[#123054] shadow-xs transition-colors hover:bg-[#17a047] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-500"
            >
              {t('invoices.endOfTerm.passOn.action')}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Dialogs */}
      {activeModal === 'buy' && (
        <BuyDialog
          assetName={assetName}
          settlement={buyoutSettlement}
          locale={locale}
          isSubmitting={isSubmitting}
          onConfirm={() => handleResolve('buyout')}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'return' && (
        <ReturnDialog
          assetName={assetName}
          locale={locale}
          isSubmitting={isSubmitting}
          onConfirm={() => handleResolve('return')}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'pass_on' && (
        <PassOnDialog
          assetName={assetName}
          topMatch={topMatch}
          avoidedCo2Kg={avoidedCo2Kg}
          locale={locale}
          isSubmitting={isSubmitting}
          onConfirm={() => handleResolve('pass_on')}
          onClose={() => setActiveModal(null)}
        />
      )}
    </section>
  );
}

function BuyDialog({
  assetName,
  settlement,
  locale,
  isSubmitting,
  onConfirm,
  onClose,
}: {
  assetName: string;
  settlement: BuyoutSettlement;
  locale: Locale;
  isSubmitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = getT(locale);
  const intlTag = intlLocale[locale];
  const headingId = useId();

  useEscapeKey(onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-[16px] backdrop-blur-xs"
    >
      <div className="w-full max-w-lg rounded-[12px] border border-[#dad9d8] bg-[#FFFFFF] p-[24px] text-[#353331] shadow-xl dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100">
        <h3 id={headingId} className="text-[1.375rem] font-bold">
          {t('invoices.endOfTerm.buy.dialogTitle')}
        </h3>
        <p className="mt-[4px] text-[0.875rem] text-[#615b57] dark:text-stone-400">
          {assetName} · {t('invoices.endOfTerm.buy.dialogIntro')}
        </p>

        <div className="mt-[20px] rounded-[8px] border border-[#ededed] bg-[#f7f7f7] p-[16px] dark:border-stone-800 dark:bg-stone-950/50">
          <dl className="space-y-[8px] text-[0.875rem]">
            <div className="flex justify-between">
              <dt className="text-[#615b57] dark:text-stone-400">
                {t('invoices.endOfTerm.buy.netAmount')}
              </dt>
              <dd className="font-mono font-medium tabular-nums">
                {formatEuro(settlement.buyoutNetCents, intlTag)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#615b57] dark:text-stone-400">
                {t('invoices.endOfTerm.buy.vat', { rate: settlement.vatRatePercent })}
              </dt>
              <dd className="font-mono font-medium tabular-nums">
                {formatEuro(settlement.vatCents, intlTag)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-[#dad9d8] pt-[8px] text-[1rem] font-bold dark:border-stone-700">
              <dt>{t('invoices.endOfTerm.buy.grossTotal')}</dt>
              <dd className="font-mono text-[#1354a5] tabular-nums dark:text-sky-400">
                {formatEuro(settlement.grossCents, intlTag)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-[24px] flex items-center justify-end gap-[12px]">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-[8px] border border-[#bfbcbb] bg-transparent px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#353331] hover:bg-[#ededed] dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {t('invoices.endOfTerm.cancelButton')}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="rounded-[8px] bg-[#1a65c1] px-[16px] py-[8px] text-[0.875rem] font-semibold text-white hover:bg-[#1354a5] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            {isSubmitting
              ? t('invoices.endOfTerm.processing')
              : t('invoices.endOfTerm.buy.confirmButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnDialog({
  assetName,
  locale,
  isSubmitting,
  onConfirm,
  onClose,
}: {
  assetName: string;
  locale: Locale;
  isSubmitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = getT(locale);
  const headingId = useId();

  useEscapeKey(onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-[16px] backdrop-blur-xs"
    >
      <div className="w-full max-w-lg rounded-[12px] border border-[#dad9d8] bg-[#FFFFFF] p-[24px] text-[#353331] shadow-xl dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100">
        <h3 id={headingId} className="text-[1.375rem] font-bold">
          {t('invoices.endOfTerm.return.dialogTitle')}
        </h3>
        <p className="mt-[4px] text-[0.875rem] text-[#615b57] dark:text-stone-400">
          {assetName} · {t('invoices.endOfTerm.return.dialogIntro')}
        </p>

        <div className="mt-[20px] rounded-[8px] border border-[#dad9d8] bg-[#f7f7f7] p-[16px] dark:border-stone-800 dark:bg-stone-950/50">
          <p className="text-[0.875rem] font-bold text-[#353331] dark:text-stone-200">
            {t('invoices.endOfTerm.return.checklistHeading')}
          </p>
          <ul className="mt-[8px] space-y-[6px] text-[0.875rem] text-[#615b57] dark:text-stone-400">
            <li className="flex items-start gap-[8px]">
              <span className="text-[#16A34A]">✓</span>
              {t('invoices.endOfTerm.return.checklistItem1')}
            </li>
            <li className="flex items-start gap-[8px]">
              <span className="text-[#16A34A]">✓</span>
              {t('invoices.endOfTerm.return.checklistItem2')}
            </li>
            <li className="flex items-start gap-[8px]">
              <span className="text-[#16A34A]">✓</span>
              {t('invoices.endOfTerm.return.checklistItem3')}
            </li>
          </ul>
          <p className="mt-[12px] border-t border-[#dad9d8] pt-[8px] text-[0.75rem] text-[#857f7a] dark:border-stone-800 dark:text-stone-500">
            {t('invoices.endOfTerm.return.inspectionNotice')}
          </p>
        </div>

        <div className="mt-[24px] flex items-center justify-end gap-[12px]">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-[8px] border border-[#bfbcbb] bg-transparent px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#353331] hover:bg-[#ededed] dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {t('invoices.endOfTerm.cancelButton')}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="rounded-[8px] bg-[#1a65c1] px-[16px] py-[8px] text-[0.875rem] font-semibold text-white hover:bg-[#1354a5] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            {isSubmitting
              ? t('invoices.endOfTerm.processing')
              : t('invoices.endOfTerm.return.confirmButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

function PassOnDialog({
  assetName,
  topMatch,
  avoidedCo2Kg,
  locale,
  isSubmitting,
  onConfirm,
  onClose,
}: {
  assetName: string;
  topMatch?: WaitingListMatch;
  avoidedCo2Kg: number;
  locale: Locale;
  isSubmitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = getT(locale);
  const intlTag = intlLocale[locale];
  const headingId = useId();

  useEscapeKey(onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-[16px] backdrop-blur-xs"
    >
      <div className="w-full max-w-lg rounded-[12px] border border-[#dad9d8] bg-[#FFFFFF] p-[24px] text-[#353331] shadow-xl dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100">
        <h3 id={headingId} className="text-[1.375rem] font-bold">
          {t('invoices.endOfTerm.passOn.dialogTitle')}
        </h3>
        <p className="mt-[4px] text-[0.875rem] text-[#615b57] dark:text-stone-400">
          {assetName} · {t('invoices.endOfTerm.passOn.dialogIntro')}
        </p>

        {topMatch ? (
          <div className="mt-[20px] rounded-[8px] border border-[#cde5d5] bg-[#f7f8f7] p-[16px] dark:border-emerald-800 dark:bg-emerald-950/30">
            <p className="text-[0.75rem] font-bold tracking-wider text-[#14522a] uppercase dark:text-emerald-300">
              {t('invoices.endOfTerm.passOn.matchHeading')}
            </p>
            <p className="mt-[2px] text-[1rem] font-bold text-[#14522a] dark:text-emerald-200">
              {topMatch.request.who}
            </p>
            <dl className="mt-[10px] grid grid-cols-2 gap-[8px] text-[0.875rem]">
              <div>
                <dt className="text-[0.75rem] text-[#615b57] dark:text-stone-400">
                  {t('invoices.endOfTerm.passOn.matchedRent')}
                </dt>
                <dd className="font-mono font-bold text-[#14522a] tabular-nums dark:text-emerald-300">
                  {formatEuro(topMatch.monthlyNetRentCents, intlTag)} / mo
                </dd>
              </div>
              <div>
                <dt className="text-[0.75rem] text-[#615b57] dark:text-stone-400">
                  {t('invoices.endOfTerm.passOn.matchedNeededBy')}
                </dt>
                <dd className="font-medium text-[#353331] dark:text-stone-200">
                  {formatIsoDate(topMatch.request.needed_by, locale)}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="mt-[20px] rounded-[8px] border border-[#dad9d8] bg-[#f7f7f7] p-[16px] text-[0.875rem] text-[#615b57] dark:border-stone-800 dark:bg-stone-950/50">
            {t('invoices.endOfTerm.passOn.noMatchNotice')}
          </p>
        )}

        <div className="mt-[16px] rounded-[8px] border border-[#cde5d5] bg-[#eaf0ec] p-[16px] text-[#14522a] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p className="text-[0.75rem] font-bold tracking-wider uppercase">
            {t('invoices.endOfTerm.passOn.impactHeading')}
          </p>
          <div className="mt-[4px] flex items-baseline justify-between">
            <span className="text-[0.875rem]">{t('invoices.endOfTerm.passOn.avoidedCo2')}</span>
            <span className="font-mono text-[1.125rem] font-bold tabular-nums text-[#16A34A] dark:text-emerald-300">
              {t('invoices.endOfTerm.passOn.avoidedCo2Value', { co2: avoidedCo2Kg })}
            </span>
          </div>
        </div>

        <div className="mt-[24px] flex items-center justify-end gap-[12px]">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-[8px] border border-[#bfbcbb] bg-transparent px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#353331] hover:bg-[#ededed] dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {t('invoices.endOfTerm.cancelButton')}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="rounded-[8px] bg-[#1a65c1] px-[16px] py-[8px] text-[0.875rem] font-semibold text-white hover:bg-[#1354a5] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            {isSubmitting
              ? t('invoices.endOfTerm.processing')
              : t('invoices.endOfTerm.passOn.confirmButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

function useEscapeKey(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
}
