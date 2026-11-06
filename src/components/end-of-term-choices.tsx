'use client';

// The three end-of-term choices as cards: buy it, return it, or pass it on. All of them wait
// until the lease is settled (no unpaid invoices). The server checks every choice again (see
// src/server/end-of-term.ts); this only sends it and shows the outcome.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type EndOfTermChoicesProps = {
  contractId: string;
  actor: string;
  /** No unpaid invoices: every choice needs this. */
  settled: boolean;
  /** Formatted amounts, worked out on the server. */
  buyout: { net: string; vatPercent: string; vat: string; total: string } | null;
  recipients: { id: string; name: string }[];
  locale: Locale;
};

const cardClass =
  'flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900';
const buttonClass =
  'mt-auto rounded-lg px-5 py-2.5 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50';

export function EndOfTermChoices(props: EndOfTermChoicesProps) {
  const { contractId, actor, settled, buyout, recipients, locale } = props;
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');

  async function choose(path: string, body: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/contracts/${contractId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor, ...body }),
      });
      if (!response.ok) throw new Error('refused');
      router.push(`/${locale}/contracts/${contractId}`);
      router.refresh();
    } catch {
      setError(t('end.failed'));
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className={cardClass}>
          <h2 className="text-lg font-semibold">{t('end.buy.title')}</h2>
          <p className="mt-2 text-sm text-stone-700 dark:text-stone-300">{t('end.buy.text')}</p>
          {buyout ? (
            <dl className="my-4 space-y-1 text-sm tabular-nums">
              <Line label={t('end.buy.net')} value={buyout.net} />
              <Line label={t('end.buy.vat', { percent: buyout.vatPercent })} value={buyout.vat} />
              <Line label={t('end.buy.total')} value={buyout.total} strong />
            </dl>
          ) : null}
          <button
            type="button"
            disabled={!settled || !buyout || busy}
            onClick={() => void choose('buy', {})}
            className={`${buttonClass} bg-emerald-700 hover:bg-emerald-800`}
          >
            {buyout ? t('end.buy.button', { total: buyout.total }) : t('end.buy.title')}
          </button>
          <p className="mt-2 text-xs text-stone-500">{t('end.buy.demo')}</p>
        </section>

        <section className={cardClass}>
          <h2 className="text-lg font-semibold">{t('end.return.title')}</h2>
          <p className="mt-2 mb-4 text-sm text-stone-700 dark:text-stone-300">
            {t('end.return.text')}
          </p>
          <button
            type="button"
            disabled={!settled || busy}
            onClick={() => void choose('return', {})}
            className={`${buttonClass} bg-sky-700 hover:bg-sky-800`}
          >
            {t('end.return.button')}
          </button>
        </section>

        <section className={cardClass}>
          <h2 className="text-lg font-semibold">{t('end.pass.title')}</h2>
          <p className="mt-2 text-sm text-stone-700 dark:text-stone-300">{t('end.pass.text')}</p>
          <label className="my-4 block text-sm font-medium">
            {t('end.pass.to')}
            <select
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
            >
              <option value="">{t('end.pass.choose')}</option>
              {recipients.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!settled || !recipient || busy}
            onClick={() => void choose('pass-on', { toCustomerId: recipient })}
            className={`${buttonClass} bg-violet-700 hover:bg-violet-800`}
          >
            {t('end.pass.button')}
          </button>
        </section>
      </div>
      {error ? (
        <p role="alert" className="mt-4 text-sm font-medium text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'text-base font-semibold' : ''}`}>
      <dt className={strong ? '' : 'text-stone-600 dark:text-stone-400'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
