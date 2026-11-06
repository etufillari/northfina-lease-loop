'use client';
// The return inspection on a desk card: the suggested grade, why, and a way to correct it.
// Saving re-runs the desk's decision on the graded condition; executing the card without
// saving accepts the suggestion (src/server/inspection.ts).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AssetCondition } from '@/data/schemas';
import { CONDITION_ORDER } from '@/domain/inspection';
import { formatNumber } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { ReturnInspection } from '@/server/inspection';

export function InspectionForm({
  locale,
  assetId,
  usageUnit,
  inspection,
  graded,
  asOfParam,
}: {
  locale: Locale;
  assetId: string;
  usageUnit: string;
  inspection: ReturnInspection;
  /** The grade the card's decision uses now: the inspection's, or the suggestion. */
  graded: AssetCondition;
  asOfParam: string | null;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [condition, setCondition] = useState<AssetCondition>(graded);
  const [busy, setBusy] = useState(false);
  const condLabel = (c: string) => t(`condition.${c}` as MessageKey);
  const usage = (value: number) =>
    t(`usage.${usageUnit}` as MessageKey, { value: formatNumber(value, locale) });
  // As it went out or worse, never better.
  const choices = CONDITION_ORDER.slice(CONDITION_ORDER.indexOf(inspection.conditionOut));

  async function save() {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/second-life/${assetId}/inspect${asOfParam ? `?asOf=${asOfParam}` : ''}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ condition }),
        }
      );
      const body = await response.json();
      if (body.success) router.refresh();
      else window.alert(body.error?.message ?? t('common.error'));
    } catch {
      window.alert(t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-stone-50 p-4 text-sm ring-1 ring-stone-200 ring-inset dark:bg-stone-950 dark:ring-stone-800">
      <h3 className="font-semibold">{t('secondLife.inspection.title')}</h3>
      <p className="mt-1">
        {t('secondLife.inspection.suggestion', {
          out: condLabel(inspection.conditionOut),
          used: usage(inspection.usedDuringLease),
          suggested: condLabel(inspection.suggested.condition),
          step: usage(inspection.wearStep),
        })}
      </p>
      <p className="mt-1 text-stone-600 dark:text-stone-400">
        {inspection.inspected
          ? t('secondLife.inspection.done', { condition: condLabel(inspection.inspected) })
          : t('secondLife.inspection.pending')}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span>{t('secondLife.inspection.grade')}</span>
          <select
            value={condition}
            onChange={(event) => setCondition(event.target.value as AssetCondition)}
            disabled={busy}
            className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-stone-700 dark:bg-stone-900"
          >
            {choices.map((c) => (
              <option key={c} value={c}>
                {condLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-white px-3 py-1.5 font-medium ring-1 ring-stone-300 ring-inset hover:bg-stone-100 disabled:opacity-50 dark:bg-stone-800 dark:ring-stone-600 dark:hover:bg-stone-700"
        >
          {busy ? t('common.loading') : t('secondLife.inspection.save')}
        </button>
      </div>
    </section>
  );
}
