'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type Quote = {
  id: string;
  monthlyNetRentCents: number;
  buyoutNetCents: number;
  termMonths: number;
};

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string; details?: { repriced?: Quote } } };

type ContractSigningProps = {
  quoteId: string;
  initialCustomerId?: string;
  locale: Locale;
};

export function ContractSigning({ quoteId, initialCustomerId, locale }: ContractSigningProps) {
  const t = useMemo(() => getT(locale), [locale]);
  const [quote, setQuote] = useState<Quote>();
  const [customerId, setCustomerId] = useState(initialCustomerId ?? '');
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSigning, setIsSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    let active = true;
    const translate = getT(locale);
    fetch(`/api/quotes/${encodeURIComponent(quoteId)}`)
      .then(async (response) => {
        const body = (await response.json()) as ApiResponse<Quote>;
        if (!response.ok || !body.success) {
          throw new Error(body.success ? 'quote_load_failed' : body.error.message);
        }
        if (active) setQuote(body.data);
      })
      .catch(() => {
        if (active) setError(translate('contract.loadError'));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [locale, quoteId]);

  async function sign() {
    if (!quote || !customerId.trim()) return;
    setError(undefined);
    setIsSigning(true);
    try {
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.id,
          customerId: customerId.trim(),
          accepted: {
            monthlyNetRentCents: quote.monthlyNetRentCents,
            buyoutNetCents: quote.buyoutNetCents,
          },
          actor: customerId.trim(),
        }),
      });
      const body = (await response.json()) as ApiResponse<unknown>;
      if (!response.ok || !body.success) {
        const repriced = body.success ? undefined : body.error.details?.repriced;
        if (repriced) {
          setQuote(repriced);
          setError(t('contract.priceChanged'));
        } else {
          setError(t('contract.signError'));
        }
        return;
      }
      setSigned(true);
    } catch {
      setError(t('contract.signError'));
    } finally {
      setIsSigning(false);
    }
  }

  if (isLoading) {
    return <p className="mt-8 text-stone-700 dark:text-stone-300">{t('contract.loading')}</p>;
  }
  if (error && !quote) {
    return <p className="mt-8 text-red-700 dark:text-red-300">{error}</p>;
  }
  if (signed) {
    return (
      <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950">
        <h2 className="text-xl font-semibold">{t('contract.signedTitle')}</h2>
        <p className="mt-2 text-stone-700 dark:text-stone-300">{t('contract.signedDescription')}</p>
      </section>
    );
  }
  if (!quote) return null;

  return (
    <section className="mt-8 rounded-2xl border border-stone-200 p-6 dark:border-stone-800">
      <h2 className="text-xl font-semibold">{t('contract.reviewTitle')}</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Fact
          label={t('contract.monthlyRent')}
          value={formatEuro(quote.monthlyNetRentCents, intlLocale[locale])}
        />
        <Fact
          label={t('contract.buyout')}
          value={formatEuro(quote.buyoutNetCents, intlLocale[locale])}
        />
        <Fact
          label={t('contract.term')}
          value={t('contract.termMonths', { months: quote.termMonths })}
        />
      </dl>
      <label className="mt-6 block text-sm font-medium" htmlFor="customer-id">
        {t('contract.customerId')}
      </label>
      <input
        id="customer-id"
        value={customerId}
        onChange={(event) => setCustomerId(event.target.value)}
        className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 dark:border-stone-700 dark:bg-stone-900"
        required
      />
      {error ? <p className="mt-3 text-red-700 dark:text-red-300">{error}</p> : null}
      <button
        type="button"
        onClick={sign}
        disabled={isSigning || !customerId.trim()}
        className="mt-6 rounded-xl bg-emerald-700 px-5 py-3 font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSigning ? t('contract.signing') : t('contract.sign')}
      </button>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
