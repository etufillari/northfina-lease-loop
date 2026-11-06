'use client';

import { useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type Props = {
  token: string;
  locale: Locale;
};

type ResponseBody =
  | { success: true; data: { status: string; expected_return_date: string | null } }
  | { success: false; error: { code: string } };

export function CustomerReturnRequest({ token, locale }: Props) {
  const t = getT(locale);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setError(undefined);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/customer-portal/${encodeURIComponent(token)}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = (await response.json()) as ResponseBody;
      if (!response.ok || !body.success) {
        setError(
          body.success
            ? t('portal.returnError')
            : body.error.code === 'RETURN_REQUEST_ALREADY_OPEN'
              ? t('portal.returnAlreadyRequested')
              : t('portal.returnError')
        );
        return;
      }
      setSubmitted(true);
    } catch {
      setError(t('portal.returnError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950">
        <h2 className="text-xl font-semibold">{t('portal.returnRequestedTitle')}</h2>
        <p className="mt-2 text-stone-700 dark:text-stone-300">
          {t('portal.returnRequestedDescription')}
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-stone-200 p-6 dark:border-stone-800">
      <h2 className="text-xl font-semibold">{t('portal.endOfTermTitle')}</h2>
      <p className="mt-2 text-stone-700 dark:text-stone-300">{t('portal.endOfTermDescription')}</p>
      {error ? <p className="mt-3 text-red-700 dark:text-red-300">{error}</p> : null}
      <button
        type="button"
        onClick={submit}
        disabled={isSubmitting}
        className="mt-5 rounded-xl bg-emerald-700 px-5 py-3 font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? t('portal.returnSubmitting') : t('portal.requestReturn')}
      </button>
    </section>
  );
}
