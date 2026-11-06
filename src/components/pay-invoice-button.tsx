'use client';

// "Pay" on one invoice row: POST /api/invoices/:id/pay, then the page reloads with the invoice
// paid. The server pays on its own day (the demo clock) as the actor of its cookie; the browser
// sends nothing. A refusal comes back as a code, written by `payRefusalText` (pay-refusal.ts).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { payRefusalText } from './pay-refusal';
import { Button } from './ui';

export function PayInvoiceButton({
  invoiceId,
  sequence,
  locale,
}: {
  invoiceId: string;
  sequence: number;
  locale: Locale;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/pay`, {
      method: 'POST',
    }).catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    if (!body?.success) {
      setError(payRefusalText(locale, body));
      setPending(false);
      return;
    }
    router.refresh();
    setPending(false);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={pay}
        pending={pending}
        pendingLabel={t('invoice.pay.pending')}
        aria-label={t('invoice.pay.label', { sequence })}
      >
        {t('invoice.pay.button')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs whitespace-normal text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
