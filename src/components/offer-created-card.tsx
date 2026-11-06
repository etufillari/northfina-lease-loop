'use client';

import { useState } from 'react';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export type OfferCreatedCardProps = {
  token: string;
  expiresAt: string;
  assetId: string;
  termMonths: number;
  downPaymentCents: number;
  locale: Locale;
  onSign: () => void;
  isSigning?: boolean;
  isEvaluating?: boolean;
};

export function OfferCreatedCard({
  token,
  expiresAt,
  assetId,
  termMonths,
  downPaymentCents,
  locale,
  onSign,
  isSigning = false,
  isEvaluating = false,
}: OfferCreatedCardProps) {
  const t = getT(locale);
  const [copiedLink, setCopiedLink] = useState(false);

  function handleCopyLink() {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/${locale}/apply?asset=${assetId}&term=${termMonths}&down=${downPaymentCents}&token=${encodeURIComponent(token)}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  }

  return (
    <div
      role="status"
      className="w-full rounded-[8px] border border-[#2ed167] bg-[#f7f8f7] p-[16px] text-[#14522a] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
    >
      <div className="flex items-center gap-[8px]">
        <svg
          aria-hidden="true"
          className="size-5 shrink-0 text-[#16A34A]"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
        <h3 className="text-[1rem] font-bold">{t('contract.offerCreatedTitle')}</h3>
      </div>
      <p className="mt-[4px] text-[0.875rem]">
        {t('contract.offerCreatedDesc', {
          date: formatIsoDate(expiresAt.slice(0, 10), locale),
          days: 14,
        })}
      </p>
      <div className="mt-[12px] flex flex-col gap-[8px]">
        <button
          type="button"
          disabled={isSigning || isEvaluating}
          onClick={onSign}
          className="w-full rounded-[8px] bg-[#1a65c1] px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#FFFFFF] transition-colors hover:bg-[#1354a5] disabled:cursor-not-allowed disabled:bg-[#857f7a] dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-stone-700 dark:disabled:text-stone-400"
        >
          {isSigning ? t('apply.signingButton') : t('contract.offerProceedButton')}
        </button>
        <button
          type="button"
          onClick={handleCopyLink}
          className="w-full rounded-[8px] border border-[#bfbcbb] bg-transparent px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#353331] hover:bg-[#ededed] dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          {copiedLink ? t('contract.offerLinkCopied') : t('contract.offerCopyLink')}
        </button>
      </div>
    </div>
  );
}
