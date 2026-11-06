'use client';
import { useState } from 'react';
import { formatEuro } from '@/domain/money';
import type { calculateExitQuote } from '@/domain/circular/exit-quote';
import type { Translate } from '@/i18n/get-t';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
type Quote = ReturnType<typeof calculateExitQuote> & { blockedByIssuedInvoices: boolean };
export function EarlyExitPreview({
  leaseId,
  locale,
  busy,
  maxElapsedMonths,
  confirm,
}: {
  leaseId: string;
  locale: Locale;
  busy: boolean;
  maxElapsedMonths: number;
  confirm: (elapsed: number) => Promise<void>;
}) {
  const t: Translate = getT(locale);
  const [elapsed, setElapsed] = useState(6);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  async function preview() {
    setLoading(true);
    setError(false);
    setQuote(null);
    try {
      const response = await fetch(`/api/leases/${leaseId}/exit-quote?elapsedMonths=${elapsed}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('failed');
      const result = (await response.json()) as { data: Quote };
      setQuote(result.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  return (
    <div className="ui-surface space-y-3 p-4 sm:col-span-3" aria-busy={loading || busy}>
      <h4 className="font-semibold">{t('exit.title')}</h4>
      <p className="text-sm">{t('exit.policy')}</p>
      <label className="block text-sm">
        {t('exit.elapsed')}
        <input
          className="ui-control mt-2 max-w-32"
          type="number"
          min={1}
          max={maxElapsedMonths}
          value={elapsed}
          disabled={loading || busy}
          onChange={(e) => {
            setElapsed(Number(e.target.value));
            setQuote(null);
          }}
        />
      </label>
      <button
        type="button"
        className="ui-secondary"
        disabled={
          loading || busy || !Number.isInteger(elapsed) || elapsed < 1 || elapsed > maxElapsedMonths
        }
        onClick={() => void preview()}
      >
        {t('exit.preview')}
      </button>
      {quote && (
        <div role="status" className="space-y-2 text-sm">
          <p>
            {t('exit.remaining')}: {quote.remainingMonths} × {money(quote.monthlyNetCents)} ={' '}
            {money(quote.remainingRentNetCents)}
          </p>
          <p>
            {t('exit.cap')}: {money(quote.buyoutCapNetCents)}
          </p>
          <p>
            {t('exit.net')}: {money(quote.feeNetCents)}
          </p>
          <p>
            {t('engine.vat')}: {money(quote.vatCents)} ({quote.rateBps / 100}%)
          </p>
          <p className="font-semibold">
            {t('engine.gross')}: {money(quote.grossCents)} · {quote.effectiveOn}
          </p>
          <p>{t('exit.obligation')}</p>
          {quote.blockedByIssuedInvoices ? (
            <p role="alert">{t('exit.credit')}</p>
          ) : (
            <button
              type="button"
              className="ui-primary"
              disabled={busy || loading}
              onClick={() => void confirm(quote.elapsedMonths)}
            >
              {t('exit.confirm')}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-700 dark:text-red-300">
          {t('exit.error')}
        </p>
      )}
    </div>
  );
}
