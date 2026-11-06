'use client';

// Signing an approved application (issue 39, spine step 4): an optional start day, then
// POST /api/contracts and on to the new contract's page. The server signs on its own day (the
// demo clock) and copies the quote; the browser sends no price and no signing day. A refusal
// comes back as a code and is written by `signRefusalText`.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { signRefusalText } from './sign-refusal';
import { Button, Field, Notice, inputClasses } from './ui';

type SignContractFormProps = {
  applicationId: string;
  locale: Locale;
  /** The signing day (the server's today) and the latest start it allows (D7, D45). */
  today: string;
  maxStartDate: string;
  maxMonths: number;
};

export function SignContractForm(props: SignContractFormProps) {
  const { applicationId, locale, today, maxStartDate, maxMonths } = props;
  const t = getT(locale);
  const router = useRouter();
  const [startDate, setStartDate] = useState(today);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // The start day is left out when it is the signing day: the server then uses its own.
      body: JSON.stringify(
        startDate && startDate !== today ? { applicationId, startDate } : { applicationId }
      ),
    }).catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    const contractId: unknown = body?.data?.contract?.id;
    if (!body?.success || typeof contractId !== 'string') {
      setError(signRefusalText(locale, body?.error?.details));
      setPending(false);
      return;
    }
    router.push(`/${locale}/contracts/${contractId}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        id="sign-start-date"
        label={t('contract.sign.startDate')}
        hint={t('contract.sign.startHint', { maxMonths })}
      >
        {(control) => (
          <input
            {...control}
            type="date"
            required
            min={today}
            max={maxStartDate}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClasses}
          />
        )}
      </Field>
      {error ? (
        <Notice tone="error" live>
          {error}
        </Notice>
      ) : null}
      <Button type="submit" pending={pending} pendingLabel={t('contract.sign.pending')}>
        {t('contract.sign.button')}
      </Button>
    </form>
  );
}
