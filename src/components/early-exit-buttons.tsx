'use client';

// The two early-exit choices: buy the item now, or return it now. The server prices and checks
// both again (src/server/early-exit.ts).
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type EarlyExitButtonsProps = {
  contractId: string;
  actor: string;
  buyLabel: string;
  returnLabel: string;
  failedLabel: string;
  disabled: boolean;
  doneHref: string;
};

export function EarlyExitButtons(props: EarlyExitButtonsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function exit(choice: 'buy' | 'return') {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/contracts/${props.contractId}/exit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice, actor: props.actor }),
      });
      if (!response.ok) throw new Error('refused');
      router.push(props.doneHref);
      router.refresh();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  const button =
    'rounded-lg px-5 py-2.5 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={props.disabled || busy}
          onClick={() => void exit('buy')}
          className={`${button} bg-emerald-700 hover:bg-emerald-800`}
        >
          {props.buyLabel}
        </button>
        <button
          type="button"
          disabled={props.disabled || busy}
          onClick={() => void exit('return')}
          className={`${button} bg-sky-700 hover:bg-sky-800`}
        >
          {props.returnLabel}
        </button>
      </div>
      {failed ? (
        <p role="alert" className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-300">
          {props.failedLabel}
        </p>
      ) : null}
    </div>
  );
}
