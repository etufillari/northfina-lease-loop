'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { QuestionsFile } from '@/data/schemas';
import { applicationQuestions, type ApplicationAnswers } from '@/domain/application';
import { applicationCart } from '@/domain/application-cart';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { CheckoutData } from '@/server/checkout-options';
import { ApplicationField } from './application-field';
import { useCart } from './cart-store';

export function ApplicationForm({
  locale,
  data,
  bank,
  name,
  email,
  initialAnswers,
}: {
  locale: Locale;
  data: CheckoutData;
  bank: QuestionsFile;
  name: string;
  email: string;
  /** Prefilled answers, e.g. a demo persona's data-pack record. */
  initialAnswers?: ApplicationAnswers;
}) {
  const router = useRouter();
  const t = getT(locale);
  const cart = useCart();
  const quote = applicationCart(data, cart);
  const [answers, setAnswers] = useState<ApplicationAnswers>({
    q_customer_type: 'consumer',
    q_full_name: name,
    q_email: email,
    ...initialAnswers,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'changed' | 'login' | 'incomplete' | 'error' | null>(null);
  const visible = quote ? applicationQuestions(bank, quote.context, answers) : null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart, answers: visible?.answers }),
      });
      if (!response.ok) {
        setError(
          response.status === 401
            ? 'login'
            : response.status === 409
              ? 'changed'
              : response.status === 422
                ? 'incomplete'
                : 'error'
        );
        return;
      }
      const result = await response.json();
      router.push(`/${locale}/applications/${encodeURIComponent(result.data.id)}`);
    } catch {
      setError('error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-copy px-card py-section-compact">
      <Link href={`/${locale}/cart`} className="inline-flex min-h-target items-center text-primary">
        {t('application.back')}
      </Link>
      <h1 className="mt-6 font-display text-display-sm font-semibold tablet:text-display-lg">
        {t('application.title')}
      </h1>
      <p className="mt-4 max-w-prose text-body text-ink-muted">{t('application.intro')}</p>
      {!quote || !visible ? (
        <p className="mt-8 rounded-lg bg-parchment p-card">{t('application.changed')}</p>
      ) : (
        <div className="mt-10 grid items-start gap-10 tablet:grid-cols-[minmax(0,1fr)_280px]">
          <form onSubmit={submit} aria-busy={busy}>
            <fieldset disabled={busy} className="space-y-6">
              <legend className="sr-only">{t('application.title')}</legend>
              {visible.questions.map((question) => (
                <ApplicationField
                  key={question.id}
                  question={question}
                  answer={visible.answers[question.id]}
                  locale={locale}
                  today={data.today}
                  onChange={(value) => {
                    setAnswers(
                      applicationQuestions(bank, quote.context, {
                        ...answers,
                        [question.id]: value,
                      }).answers
                    );
                    setError(null);
                  }}
                />
              ))}
              {error ? (
                <p role="alert" className="rounded-sm bg-parchment p-4">
                  {t(`application.${error}`)}
                  {error === 'login' ? (
                    <Link
                      href={`/${locale}/login?next=application`}
                      className="ml-2 text-primary underline"
                    >
                      {t('auth.login')}
                    </Link>
                  ) : null}
                </p>
              ) : null}
              <button
                type="submit"
                className="pressable min-h-target w-full rounded-pill bg-primary px-6 py-3 text-on-dark disabled:opacity-50"
              >
                {t(busy ? 'application.working' : 'application.submit')}
              </button>
            </fieldset>
          </form>
          <aside className="rounded-lg bg-parchment p-card">
            <h2 className="text-tagline font-semibold">{t('cart.summary')}</h2>
            <ul className="mt-4 space-y-3 text-caption">
              {quote.items.map((item) => (
                <li key={item.id}>
                  {item.name} · {t('product.months', { count: item.termMonths })}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-caption">{t('cart.monthlyTotal')}</p>
            <p className="mt-2 text-lead font-semibold tabular-nums">
              {formatEuro(quote.context.monthlyTotalCents, intlLocale[locale])}
            </p>
            <p className="mt-4 text-caption text-ink-muted">{t('application.notice')}</p>
          </aside>
        </div>
      )}
    </div>
  );
}
