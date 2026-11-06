'use client';

import { useEffect, useState } from 'react';
import { getT } from '@/i18n/get-t';
import { Contract, type ContractProps, type SignedContract } from './contract';

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
            ? 'border border-[#cde5d5] bg-[#eaf0ec] text-[#14522a] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
            : isOpen
              ? 'border border-[#bfbcbb] bg-transparent text-[#353331] hover:bg-[#f7f7f7] dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'
              : 'bg-[#1a65c1] text-[#FFFFFF] hover:bg-[#1354a5] dark:bg-sky-600 dark:hover:bg-sky-500'
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
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-900/60 p-[16px] backdrop-blur-xs dark:bg-black/70"
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
