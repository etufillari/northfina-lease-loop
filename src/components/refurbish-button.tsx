'use client';

// Finishes the refurbishment, then opens the item so it can be leased at its used price.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AssetCondition } from '@/data/schemas';

type RefurbishButtonProps = {
  assetId: string;
  href: string;
  targetCondition: AssetCondition;
  today: string;
  label: string;
  errorLabel: string;
};

export function RefurbishButton(props: RefurbishButtonProps) {
  const { assetId, href, targetCondition, today, label, errorLabel } = props;
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function refurbish() {
    setIsBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/assets/${assetId}/refurbishment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetCondition, completedOn: today, actor: 'staff' }),
      });
      if (!response.ok) throw new Error('refurbishment_failed');
      router.push(href);
    } catch {
      setFailed(true);
      setIsBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-primary mt-4" disabled={isBusy} onClick={refurbish}>
        {label}
      </button>
      {failed ? (
        <p role="alert" className="mt-3 text-sm font-medium text-rose-700 dark:text-rose-300">
          {errorLabel}
        </p>
      ) : null}
    </>
  );
}
