'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { authButtonClass } from './auth-field';

export function DemoLeaseButton({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function create() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch('/api/leases/demo', { method: 'POST' });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-6">
      <button type="button" disabled={busy} onClick={create} className={authButtonClass}>
        {t(busy ? 'auth.working' : 'dashboard.addDemo')}
      </button>
      <p className="mt-3 text-caption text-ink-muted">{t('dashboard.demoExplanation')}</p>
      {error ? (
        <p role="alert" className="mt-2 text-caption">
          {t('dashboard.demoError')}
        </p>
      ) : null}
    </div>
  );
}

export function LeaseRequestControls({
  locale,
  id,
  disabled,
  active,
}: {
  locale: Locale;
  id: string;
  disabled: boolean;
  active: boolean;
}) {
  const t = getT(locale);
  return (
    <div>
      <div className="mt-5 flex flex-wrap gap-3">
        {!disabled ? (
          <Link
            href={`/${locale}/account/leases/${encodeURIComponent(id)}/return`}
            className="pressable inline-flex min-h-target items-center rounded-pill bg-primary px-5 py-2 text-caption font-semibold text-white"
          >
            {t('dashboard.request.return')}
          </Link>
        ) : null}
        {(['buyout', 'exchange'] as const).map((kind) =>
          (kind === 'buyout' ? !active : disabled) ? null : (
            <Link
              key={kind}
              href={`/${locale}/account/leases/${encodeURIComponent(id)}/${kind}`}
              className="pressable inline-flex min-h-target items-center rounded-pill border border-primary px-5 py-2 text-caption text-primary"
            >
              {t(kind === 'buyout' ? 'flow.buyoutTitle' : 'flow.exchangeTitle')}
            </Link>
          )
        )}
      </div>
      <p role="status" className="mt-3 text-caption">
        {disabled ? t('dashboard.requestUnavailable') : ''}
      </p>
    </div>
  );
}

export function ReturnQuoteAccept({
  locale,
  id,
  requestId,
  expectedAssessmentUpdatedAt,
  action = 'accept',
  payCents = 0,
}: {
  locale: Locale;
  id: string;
  requestId: string;
  expectedAssessmentUpdatedAt: string;
  action?: 'accept' | 'buyout';
  /** The simulated payment this confirms. Zero when there is nothing to pay or no way to pay it. */
  payCents?: number;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<'card' | 'invoice'>('card');
  const [error, setError] = useState<'quote' | 'payment' | null>(null);
  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/leases/${encodeURIComponent(id)}/return-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          requestId,
          expectedAssessmentUpdatedAt,
          ...(payCents > 0 ? { paymentMethod: method } : {}),
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.code === 'PAYMENT_REQUIRED' ? 'payment' : 'quote');
        return;
      }
      router.refresh();
    } catch {
      setError('quote');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4">
      {payCents > 0 ? (
        <fieldset disabled={busy} className="mb-4">
          <legend className="text-caption font-semibold">{t('cart.paymentMethod')}</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {(['card', 'invoice'] as const).map((value) => (
              <label
                key={value}
                className="flex min-h-target cursor-pointer items-center gap-3 rounded-lg border border-hairline p-4 has-checked:border-primary has-checked:bg-primary/5"
              >
                <input
                  type="radio"
                  name="return-payment"
                  value={value}
                  checked={method === value}
                  onChange={() => setMethod(value)}
                  className="accent-primary"
                />
                {t(`cart.${value}`)}
              </label>
            ))}
          </div>
          <p className="mt-3 text-caption text-ink-muted">{t('flow.paymentSimulation')}</p>
        </fieldset>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={accept}
        className="pressable min-h-target rounded-pill bg-primary px-5 py-2 text-caption font-semibold text-white disabled:opacity-50"
      >
        {busy
          ? t('auth.working')
          : action === 'buyout'
            ? t('return.confirmBuyout')
            : payCents > 0
              ? t('return.payNow', { amount: formatEuro(payCents, intlLocale[locale]) })
              : t('return.acceptQuote')}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-caption">
          {t(error === 'payment' ? 'return.paymentRequired' : 'return.acceptError')}
        </p>
      ) : null}
    </div>
  );
}
