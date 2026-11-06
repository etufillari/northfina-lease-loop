'use client';

import { useState } from 'react';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type Props = {
  token: string;
  locale: Locale;
  buyoutNetCents: number;
  onSubmitted: () => void;
  initialSubmitted?: boolean;
};

type ResponseBody =
  | { success: true; data: { status: string; buyout_net_cents: number } }
  | { success: false; error: { code: string } };

export function CustomerBuyoutRequest({
  token,
  locale,
  buyoutNetCents,
  onSubmitted,
  initialSubmitted = false,
}: Props) {
  const t = getT(locale);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setError(undefined);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/customer-portal/${encodeURIComponent(token)}/buyout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = (await response.json()) as ResponseBody;
      if (!response.ok || !body.success) {
        setError(
          body.success
            ? t('portal.buyoutError')
            : body.error.code === 'BUYOUT_REQUEST_ALREADY_OPEN'
              ? t('portal.buyoutAlreadyRequested')
              : t('portal.buyoutError')
        );
        return;
      }
      setSubmitted(true);
      onSubmitted();
    } catch {
      setError(t('portal.buyoutError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950">
        <h2 className="text-xl font-semibold">{t('portal.buyoutRequestedTitle')}</h2>
        <p className="mt-2 text-stone-700 dark:text-stone-300">
          {t('portal.buyoutRequestedDescription')}
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-stone-200 p-6 dark:border-stone-800">
      <h2 className="text-xl font-semibold">{t('portal.buyoutTitle')}</h2>
      <p className="mt-2 text-stone-700 dark:text-stone-300">{t('portal.buyoutDescription')}</p>
      <p className="mt-4 font-medium">
        {t('portal.buyoutAmount')}: {formatEuro(buyoutNetCents, intlLocale[locale])}
      </p>
      {error ? <p className="mt-3 text-red-700 dark:text-red-300">{error}</p> : null}
      <button
        type="button"
        onClick={submit}
        disabled={isSubmitting}
        className="mt-5 rounded-xl bg-emerald-700 px-5 py-3 font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? t('portal.buyoutSubmitting') : t('portal.requestBuyout')}
      </button>
    </section>
  );
}
