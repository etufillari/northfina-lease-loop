'use client';

// The demo stand-in for the e-signature a waiting contract needs (D-050): signs as the person it
// is waiting for, on the effective today (D-030). The server checks it again.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { refusalText } from '@/i18n/refusals';

export function CountersignButton(props: { locale: Locale; contractId: number }) {
  const t = getT(props.locale);
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  // The code the server refused with picks the message (D-038).
  const [refusal, setRefusal] = useState<string | undefined>(undefined);

  async function sign() {
    setState('busy');
    const response = await fetch(`/api/contracts/${props.contractId}/sign`, {
      method: 'POST',
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      success: boolean;
      error?: { code: string };
    } | null;
    if (body?.success) {
      router.refresh();
      return;
    }
    setRefusal(body?.error?.code);
    setState('error');
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void sign()}
        disabled={state === 'busy'}
        className="btn-primary px-6 py-3"
      >
        {t(state === 'busy' ? 'awaiting.signing' : 'awaiting.signAsSignatory')}
      </button>
      {state === 'error' ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {refusalText(t, refusal, 'awaiting.error')}
        </p>
      ) : null}
    </div>
  );
}
