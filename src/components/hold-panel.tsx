'use client';

// On an item's page, for a customer: ask for an item that isn't free yet to be held for you (with
// what you need from it), see that you have asked, or let go of an item held for you. Either can
// be undone: a customer may simply change their mind. See src/server/holds.ts.
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { AssetCondition } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

/** Conditions a customer may ask for at the least (a used item is never "new" again). */
const MIN_CONDITIONS: readonly AssetCondition[] = ['fair', 'good', 'like_new'];

type HoldPanelProps = {
  assetId: string;
  locale: Locale;
} & (
  | { mode: 'request'; terms: readonly number[] }
  | {
      mode: 'waiting';
      request: { termMonths: number; maxMonthlyCents: number; minCondition: AssetCondition };
    }
  | { mode: 'held' }
);

const field =
  'mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/30 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100';

export function HoldPanel(props: HoldPanelProps) {
  const t = getT(props.locale);
  const router = useRouter();
  const euro = (cents: number) => formatEuro(cents, intlLocale[props.locale]);
  const terms = props.mode === 'request' ? props.terms : [];
  const [termMonths, setTermMonths] = useState(terms.includes(24) ? 24 : (terms[0] ?? 24));
  const [budget, setBudget] = useState('');
  const [minCondition, setMinCondition] = useState<AssetCondition>('good');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const budgetEuros = Number(budget);
  const budgetValid = /^\d{1,6}$/.test(budget.trim()) && budgetEuros > 0;

  async function send(path: string, body: object) {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('refused');
      router.refresh(); // the page and the bell in the header
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!budgetValid) return;
    void send('/api/holds', {
      assetId: props.assetId,
      termMonths,
      maxMonthlyCents: budgetEuros * 100, // whole euros typed → cents
      minCondition,
    });
  }

  const release = () => void send('/api/holds/release', { assetId: props.assetId });
  const failure = failed ? (
    <p role="alert" className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-300">
      {t('hold.failed')}
    </p>
  ) : null;

  return (
    <section
      aria-labelledby="hold-heading"
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 id="hold-heading" className="text-lg font-semibold">
        {t(props.mode === 'held' ? 'hold.heldTitle' : 'hold.title')}
      </h2>
      {props.mode === 'request' ? (
        <form onSubmit={submit} className="mt-2 space-y-4">
          <p className="text-sm text-stone-700 dark:text-stone-300">{t('hold.intro')}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium">
              {t('hold.term')}
              <select
                value={termMonths}
                onChange={(e) => setTermMonths(Number(e.target.value))}
                className={field}
              >
                {terms.map((months) => (
                  <option key={months} value={months}>
                    {t('apply.termValue', { months })}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              {t('hold.budget')}
              <input
                type="text"
                inputMode="numeric"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                aria-invalid={(budget.trim() !== '' && !budgetValid) || undefined}
                className={field}
              />
            </label>
            <label className="block text-sm font-medium">
              {t('hold.minCondition')}
              <select
                value={minCondition}
                onChange={(e) => setMinCondition(e.target.value as AssetCondition)}
                className={field}
              >
                {MIN_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {t(`condition.${c}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={busy || !budgetValid}
            className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('hold.submit')}
          </button>
          {failure}
        </form>
      ) : (
        <div className="mt-2">
          <p className="text-sm text-stone-700 dark:text-stone-300">
            {props.mode === 'held'
              ? t('hold.held')
              : t('hold.waiting', {
                  months: props.request.termMonths,
                  budget: euro(props.request.maxMonthlyCents),
                  condition: t(`condition.${props.request.minCondition}`),
                })}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={release}
            className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 ring-inset hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:ring-stone-600 dark:hover:bg-stone-800"
          >
            {t(props.mode === 'held' ? 'hold.release' : 'hold.withdraw')}
          </button>
          {failure}
        </div>
      )}
    </section>
  );
}
