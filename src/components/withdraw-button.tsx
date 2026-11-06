'use client';

// "Cancel application" for an application that is not a lease yet (D87). Two steps, since it
// cannot be undone: the first click asks, "Yes, cancel it" posts to
// /api/applications/[id]/withdraw and refreshes the page; "Keep it" closes the question.
// A refusal is written from its code in the visitor's language (team rule 6).
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { authzRefusalKey } from './authz-refusal';
import { Button, cx } from './ui';

type WithdrawButtonProps = {
  applicationId: string;
  locale: Locale;
  className?: string;
};

export function WithdrawButton({ applicationId, locale, className }: WithdrawButtonProps) {
  const t = getT(locale);
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();
  const pending = sending || refreshing;

  async function withdraw() {
    setSending(true);
    setError(null);
    const response = await fetch(
      `/api/applications/${encodeURIComponent(applicationId)}/withdraw`,
      {
        method: 'POST',
      }
    ).catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    setSending(false);
    if (!body?.success) {
      const code: unknown = body?.error?.details?.code;
      const authz = authzRefusalKey(code);
      setError(
        authz
          ? t(authz)
          : code === 'already_signed' || code === 'not_withdrawable'
            ? t(`withdraw.refusal.${code}`)
            : t('withdraw.error')
      );
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    // Above a row's whole-row link (rows.tsx), so the buttons take their own clicks.
    <div className={cx('relative z-10 space-y-2', className)}>
      {asking ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2" role="group">
          <p className="text-sm font-semibold text-danger-ink">{t('withdraw.confirm')}</p>
          <Button
            variant="danger"
            size="sm"
            onClick={withdraw}
            pending={pending}
            pendingLabel={t('withdraw.pending')}
          >
            {t('withdraw.yes')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAsking(false)} disabled={pending}>
            {t('withdraw.no')}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="inline-flex min-h-9 cursor-pointer items-center rounded-full border-2 border-danger-line bg-raised px-3 text-sm font-bold text-danger-ink transition-colors hover:border-danger-solid hover:bg-danger-solid hover:text-raised"
        >
          {t('withdraw.button')}
        </button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
