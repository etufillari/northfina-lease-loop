'use client';

// The demo "Pay" button. It only records the invoice as paid: no money moves and no bank
// details are asked for (see the note on the pay page).
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type PayInvoiceButtonProps = {
  contractId: string;
  invoiceNumber: number;
  actor: string;
  /** Where to go once paid: the invoice page. */
  doneHref: string;
  label: string;
  sendingLabel: string;
  failedLabel: string;
};

export function PayInvoiceButton(props: PayInvoiceButtonProps) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function pay() {
    setSending(true);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/contracts/${props.contractId}/invoices/${props.invoiceNumber}/pay`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor: props.actor }),
        }
      );
      const payload = (await response.json()) as { error?: { code: string } };
      // Already paid (e.g. in another tab) counts as done too.
      if (!response.ok && payload.error?.code !== 'ALREADY_PAID') throw new Error('not paid');
      router.push(props.doneHref);
      router.refresh();
    } catch {
      setFailed(true);
      setSending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={pay}
        disabled={sending}
        className="rounded-lg bg-emerald-700 px-6 py-3 text-lg font-semibold text-white shadow-sm hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
      >
        {sending ? props.sendingLabel : props.label}
      </button>
      {failed ? (
        <p role="alert" className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-300">
          {props.failedLabel}
        </p>
      ) : null}
    </div>
  );
}
