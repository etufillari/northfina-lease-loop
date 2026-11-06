'use client';

// One returned item. The dealer records what they found, checks the price, then re-lists it.
// Changing either input clears the check, so nothing is listed at a price nobody has seen.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import type { Asset, AssetCondition } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { formatNumber } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { RelistPreview } from '@/server/second-life/relist';

const CONDITIONS: readonly AssetCondition[] = ['new', 'like_new', 'good', 'fair', 'poor'];

const refusals: Record<string, MessageKey> = {
  CONDITION_TOO_LOW: 'dealer.refused.conditionTooLow',
  PRICE_BELOW_MINIMUM: 'dealer.refused.belowMinimum',
  FIRST_LEASE_UNKNOWN: 'dealer.refused.firstLeaseUnknown',
  ASSET_NOT_RETURNED: 'dealer.refused.notReturned',
};

type RelistResponse = {
  data?: RelistPreview;
  error?: { code?: string; details?: { market_value_cents?: number } };
};

type Outcome =
  | { kind: 'none' }
  | { kind: 'priced'; preview: RelistPreview }
  | { kind: 'refused'; message: MessageKey; valueCents: number | undefined };

function refusalOf(body: RelistResponse): Outcome {
  return {
    kind: 'refused',
    message: refusals[body.error?.code ?? ''] ?? 'dealer.error',
    valueCents: body.error?.details?.market_value_cents,
  };
}

const inputClassName =
  'w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none [color-scheme:dark] focus:border-emerald-600 disabled:opacity-50';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-stone-400">{label}</dt>
      <dd className="font-medium text-stone-100">{value}</dd>
    </div>
  );
}

export function ReturnedItemCard({ asset, locale }: { asset: Asset; locale: Locale }) {
  const t = getT(locale);
  const router = useRouter();
  const conditionId = useId();
  const usageId = useId();

  const [condition, setCondition] = useState<AssetCondition>(asset.condition);
  const [usage, setUsage] = useState(String(asset.usage.value));
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'none' });
  const [busy, setBusy] = useState<'checking' | 'relisting' | null>(null);

  const usageValue = Number(usage);
  const usageIsValid = usage !== '' && Number.isInteger(usageValue) && usageValue >= 0;

  function changeCondition(next: AssetCondition) {
    setCondition(next);
    setOutcome({ kind: 'none' });
  }

  function changeUsage(next: string) {
    setUsage(next);
    setOutcome({ kind: 'none' });
  }

  async function checkPrice() {
    setBusy('checking');

    try {
      const query = new URLSearchParams({ condition, usage });
      const response = await fetch(`/api/assets/${asset.id}/relist-quote?${query.toString()}`);
      const body = (await response.json()) as RelistResponse;
      setOutcome(
        response.ok && body.data ? { kind: 'priced', preview: body.data } : refusalOf(body)
      );
    } catch {
      setOutcome({ kind: 'refused', message: 'dealer.error', valueCents: undefined });
    } finally {
      setBusy(null);
    }
  }

  async function relist() {
    setBusy('relisting');

    try {
      const response = await fetch(`/api/assets/${asset.id}/relist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition, usage_value: usageValue }),
      });
      if (response.ok) {
        router.refresh();
        return;
      }

      setOutcome(refusalOf((await response.json()) as RelistResponse));
    } catch {
      setOutcome({ kind: 'refused', message: 'dealer.error', valueCents: undefined });
    }
    setBusy(null);
  }

  const percent = (basisPoints: number) => `${formatNumber(basisPoints / 100, locale)} %`;
  const titleId = `returned-${asset.id}`;

  return (
    <article
      aria-labelledby={titleId}
      className="space-y-5 rounded-2xl border border-stone-800 bg-stone-900 p-5 sm:p-6"
    >
      <div>
        <h3 id={titleId} className="text-lg font-semibold text-stone-100">
          {asset.make} {asset.model}
        </h3>
        <p className="mt-1 text-sm text-stone-400">
          {asset.model_year} · {t('asset.previousLives')}: {asset.previous_lives}
        </p>
        <p className="mt-1 font-mono text-xs text-stone-500">{asset.id}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={conditionId} className="text-sm font-medium text-stone-300">
            {t('condition.label')}
          </label>
          <select
            id={conditionId}
            value={condition}
            onChange={(event) => changeCondition(event.target.value as AssetCondition)}
            disabled={busy !== null}
            className={inputClassName}
          >
            {CONDITIONS.map((option) => (
              <option key={option} value={option}>
                {t(`condition.${option}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor={usageId} className="text-sm font-medium text-stone-300">
            {t('asset.usage')} ({t(`usage.${asset.usage.unit}`, { value: '' }).trim()})
          </label>
          <input
            id={usageId}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={usage}
            onChange={(event) => changeUsage(event.target.value)}
            disabled={busy !== null}
            aria-invalid={!usageIsValid || undefined}
            className={inputClassName}
          />
        </div>
      </div>

      {outcome.kind === 'priced' && (
        <dl className="space-y-2 rounded-xl border border-emerald-900 bg-emerald-950/30 p-4">
          <Fact
            label={t('dealer.value.firstLease')}
            value={formatEuro(outcome.preview.first_lease_price_cents, locale)}
          />
          <Fact
            label={t('dealer.value.age', { months: outcome.preview.age_months })}
            value={percent(outcome.preview.curve_basis_points)}
          />
          <Fact
            label={t('dealer.value.condition')}
            value={percent(outcome.preview.condition_basis_points)}
          />
          <Fact
            label={t('dealer.value.usage')}
            value={percent(outcome.preview.usage_basis_points)}
          />
          <div className="border-t border-emerald-900 pt-2">
            <Fact
              label={t('dealer.value.result')}
              value={formatEuro(outcome.preview.market_value_cents, locale)}
            />
          </div>
        </dl>
      )}

      {outcome.kind === 'refused' && (
        <div role="alert" className="rounded-xl border border-amber-900 bg-amber-950/40 p-4">
          <p className="text-sm text-amber-200">{t(outcome.message)}</p>
          {outcome.valueCents !== undefined && (
            <p className="mt-1 text-sm text-amber-300">
              {t('dealer.value.asIs', { price: formatEuro(outcome.valueCents, locale) })}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-stone-800 pt-5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => void checkPrice()}
          disabled={busy !== null || !usageIsValid}
          className="rounded-xl border border-stone-700 px-5 py-2.5 text-sm font-medium text-stone-300 transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'checking' ? t('dealer.checking') : t('dealer.check')}
        </button>

        {outcome.kind === 'priced' && (
          <button
            type="button"
            onClick={() => void relist()}
            disabled={busy !== null}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'relisting'
              ? t('dealer.relisting')
              : t('dealer.relist', {
                  price: formatEuro(outcome.preview.market_value_cents, locale),
                })}
          </button>
        )}
      </div>
    </article>
  );
}
