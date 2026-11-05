'use client';

// "Change term or down payment" on the application page. It opens the lease configurator over the
// form, so the answers stay where they are. "Use these terms" puts the new choice in the URL
// without leaving the page: the server prices the lease again and the form checks its answers
// against the new deal (answers that no longer apply are removed and listed).
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Asset, CoefficientTable, VatRates } from '@/data/schemas';
import type { ListPriceResult } from '@/domain/price-list';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { Contract } from './contract';

type ChangeTermsDialogProps = {
  asset: Asset;
  price: ListPriceResult;
  coefficientTable: CoefficientTable;
  vatRates: VatRates;
  isoDate: string;
  locale: Locale;
  termMonths: number;
  /** Net down payment in cents. */
  downPaymentCents: number;
};

export function ChangeTermsDialog({
  asset,
  price,
  coefficientTable,
  vatRates,
  isoDate,
  locale,
  termMonths,
  downPaymentCents,
}: ChangeTermsDialogProps) {
  const t = getT(locale);
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setIsOpen(true)}
        className="mt-[16px] inline-block text-[0.875rem] font-semibold text-[#1354a5] underline"
      >
        {t('apply.deal.change')}
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${asset.make} ${asset.model}`}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#353331]/60 p-[16px]"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <div className="my-auto max-h-[92dvh] w-full max-w-2xl overflow-y-auto">
            <Contract
              asset={asset}
              price={price}
              coefficientTable={coefficientTable}
              vatRates={vatRates}
              isoDate={isoDate}
              locale={locale}
              initialTermMonths={termMonths}
              initialDownPaymentCents={downPaymentCents}
              onClose={() => setIsOpen(false)}
              onUseTerms={(choice) => {
                setIsOpen(false);
                router.replace(
                  `/${locale}/apply?asset=${asset.id}&term=${choice.termMonths}&down=${choice.downPaymentCents}`,
                  { scroll: false }
                );
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
