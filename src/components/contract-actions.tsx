'use client';
// During-contract actions. The early exit ALWAYS shows the full calculation first (card 8);
// confirming is a separate click. End-of-term buy/return unlock when the term is over.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type ExitBreakdown = {
  usedMonths: number;
  coveringTermMonths: number;
  fairMonthlyNetCents: number;
  fairTotalNetCents: number;
  paidNetCents: number;
  handlingFeeNetCents: number;
  exitNetCents: number;
  vatRatePercent: number;
  exitVatCents: number;
  exitTotalCents: number;
};

export function ContractActions({
  locale,
  contractId,
  personaId,
  asOf,
  endsOn,
  today,
  buyoutNetCents,
  purchaseAtEnd,
  termMonthsTotal,
}: {
  locale: Locale;
  contractId: string;
  personaId: string;
  asOf: string | null;
  endsOn: string;
  today: string;
  buyoutNetCents: number;
  purchaseAtEnd: boolean;
  termMonthsTotal: number;
}) {
  const t = getT(locale);
  const router = useRouter();
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const suffix = asOf ? `?asOf=${asOf}` : '';
  const [preview, setPreview] = useState<ExitBreakdown | null>(null);
  const [busy, setBusy] = useState(false);
  const termOver = today >= endsOn;

  async function loadPreview() {
    setBusy(true);
    const response = await fetch(`/api/contracts/${contractId}/early-exit${suffix}`);
    const body = await response.json();
    setBusy(false);
    if (body.success) setPreview(body.data.breakdown);
  }

  async function post(path: string, payload: Record<string, unknown>) {
    setBusy(true);
    const response = await fetch(`/api/contracts/${contractId}/${path}${suffix}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, actor: personaId }),
    });
    setBusy(false);
    if ((await response.json()).success) {
      setPreview(null);
      router.refresh();
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <h2 className="text-sm font-semibold">{t('contract.actions')}</h2>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={purchaseAtEnd}
          disabled={busy}
          onChange={(event) => post('buyout-option', { optIn: event.target.checked })}
          className="accent-emerald-700"
        />
        {t('buyoutOption.label', { amount: euro(buyoutNetCents) })}
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!termOver ? (
          <button
            type="button"
            onClick={loadPreview}
            disabled={busy}
            className="rounded-xl px-4 py-2 font-medium ring-1 ring-stone-300 ring-inset hover:bg-stone-50 disabled:opacity-50 dark:ring-stone-700 dark:hover:bg-stone-800"
          >
            {t('exit.button')}
          </button>
        ) : (
          <>
            <span className="text-sm font-medium">{t('endOfTerm.title')}:</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => post('end-of-term', { action: 'buy' })}
              className="rounded-xl bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {t('endOfTerm.buy', { amount: euro(buyoutNetCents) })}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => post('end-of-term', { action: 'return' })}
              className="rounded-xl px-4 py-2 font-medium ring-1 ring-stone-300 ring-inset hover:bg-stone-50 disabled:opacity-50 dark:ring-stone-700 dark:hover:bg-stone-800"
            >
              {t('endOfTerm.return')}
            </button>
          </>
        )}
        {!termOver ? (
          <span className="text-xs text-stone-500">{t('endOfTerm.notYet', { date: endsOn })}</span>
        ) : null}
      </div>

      {preview ? (
        <div className="mt-5 rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200 ring-inset dark:bg-stone-800 dark:ring-stone-700">
          <h3 className="font-semibold">{t('exit.title')}</h3>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
            {t('exit.intro', {
              used: preview.usedMonths,
              term: termMonthsTotal,
              covering: preview.coveringTermMonths,
            })}
          </p>
          <dl className="mt-3 space-y-1.5 text-sm tabular-nums">
            <Row
              label={t('exit.fairRent', {
                used: preview.usedMonths,
                covering: preview.coveringTermMonths,
                rate: euro(preview.fairMonthlyNetCents),
              })}
              value={euro(preview.fairTotalNetCents)}
            />
            <Row label={t('exit.paid')} value={`− ${euro(preview.paidNetCents)}`} />
            <Row label={t('exit.fee')} value={`+ ${euro(preview.handlingFeeNetCents)}`} />
            <Row label={t('exit.net')} value={euro(preview.exitNetCents)} bold />
            <Row
              label={`${t('price.vat')} ${preview.vatRatePercent} %`}
              value={`+ ${euro(preview.exitVatCents)}`}
            />
            <Row
              label={t('exit.total', { rate: preview.vatRatePercent })}
              value={euro(preview.exitTotalCents)}
              bold
            />
          </dl>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => post('early-exit', {})}
              className="rounded-xl bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {t('exit.confirm')}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-xl px-4 py-2 font-medium ring-1 ring-stone-300 ring-inset hover:bg-white dark:ring-stone-600"
            >
              {t('exit.cancel')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${bold ? 'font-semibold' : ''}`}>
      <dt className="text-stone-600 dark:text-stone-300">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
