'use client';

// Admin, Second life: check a returned item and give it a new life.
//   1. The check: the condition and usage it came back with (any condition: a "new" item can come
//      back "good"). Each condition shows its standard value modifier from the data pack.
//   2. The refurbishment: the condition it is brought to, the jobs the data requires, standard
//      repairs to tick (our own price list) and custom repairs with their own price.
//   3. Value and price: what it is worth, what the work cost, a suggested price and the rents.
//   4. Confirm: back in the catalogue, or reserved for the person it was passed on to.
// All maths is in src/domain (second-life, repair-catalogue, pricing); the server checks it again.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type {
  Asset,
  AssetCondition,
  CoefficientTable,
  RefurbishmentCosts,
  ResidualCurves,
  SecondLifeRequest,
} from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { leaseTerms, quoteLease } from '@/domain/pricing';
import { REPAIR_PRESETS, repairLines } from '@/domain/repair-catalogue';
import {
  CONDITIONS,
  conditionRank,
  leasableCondition,
  marketValueCents,
  rankWaitingList,
  refurbishmentPlan,
  residualPercent,
  roundToEuros,
} from '@/domain/second-life';
import { formatNumber } from '@/i18n/format';
import { getT, messages, type MessageKey, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type WorkbenchProps = {
  asset: Asset;
  originalNetCents: number;
  ageMonths: number;
  curves: ResidualCurves;
  costs: RefurbishmentCosts;
  demand: SecondLifeRequest[];
  table: CoefficientTable;
  vatPercent: number;
  today: string;
  /** Who it was passed on to, if anyone: it goes back reserved for them. */
  heldForName: string | null;
  locale: Locale;
};

type CustomLine = { label: string; euros: string };

const field =
  'mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950';
const panel =
  'rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900';

const toCents = (euros: string) => Math.round(Number(euros.replace(',', '.') || '0') * 100) || 0;

function label(key: string, fallback: string, t: Translate): string {
  return key in messages.en ? t(key as MessageKey) : fallback;
}

function jobLabel(id: string, t: Translate): string {
  const upgrade = /^([a-z_]+)->([a-z_]+)$/.exec(id);
  if (upgrade) {
    return t('secondLife.step.upgrade', {
      from: t(`condition.${upgrade[1] as AssetCondition}`),
      to: t(`condition.${upgrade[2] as AssetCondition}`),
    });
  }
  return label(`secondLife.step.${id}`, id, t);
}

export function SecondLifeWorkbench(props: WorkbenchProps) {
  const { asset, originalNetCents, ageMonths, curves, costs, demand, table, vatPercent, today } =
    props;
  const t = getT(props.locale);
  const router = useRouter();
  const euro = (cents: number) => formatEuro(cents, intlLocale[props.locale]);
  const conditionName = (c: AssetCondition) =>
    t('secondLife.withModifier', {
      condition: t(`condition.${c}`),
      factor: formatNumber(curves.condition_multiplier[c] ?? 0, props.locale),
    });

  const [found, setFound] = useState<AssetCondition>(asset.condition);
  const [usageText, setUsageText] = useState(String(asset.usage.value));
  const [after, setAfter] = useState<AssetCondition>(
    conditionRank(asset.condition) >= conditionRank('good') ? asset.condition : 'good'
  );
  const [presets, setPresets] = useState<string[]>([]);
  const [custom, setCustom] = useState<CustomLine[]>([]);
  const [notes, setNotes] = useState('');
  const [priceEuros, setPriceEuros] = useState<string | null>(null); // null = the suggestion
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The condition after can't be worse than what was found, nor "new" unless it was found new.
  const afterOptions = CONDITIONS.filter(
    (c) => conditionRank(c) >= conditionRank(found) && (c !== 'new' || found === 'new')
  );
  const conditionAfter = afterOptions.includes(after) ? after : (afterOptions[0] ?? found);
  const usageFound = Math.max(0, Math.round(Number(usageText) || 0));

  const value = (condition: AssetCondition, usage: number) =>
    marketValueCents(
      { originalNetCents, category: asset.category, ageMonths, condition, usage },
      curves
    );
  const plan = refurbishmentPlan(
    { category: asset.category, before: found, after: conditionAfter, usage: usageFound },
    costs
  );
  const customRepairs = custom
    .filter((line) => line.label.trim() !== '')
    .map((line) => ({ label: line.label, costCents: toCents(line.euros) }));
  const repairs = repairLines(asset.category, presets, customRepairs);
  const requiredCents = plan.ok ? plan.costCents : 0;
  const repairCents = repairs.ok ? repairs.costCents : 0;
  const costCents = requiredCents + repairCents;
  const valueNow = value(found, usageFound);
  const valueAfter = plan.ok ? value(conditionAfter, plan.usageAfter) : valueNow;
  const gain = valueAfter - valueNow - costCents;
  const suggested = roundToEuros(valueAfter);
  const priceCents = priceEuros === null ? suggested : toCents(priceEuros);
  const monthlyFor = (termMonths: number) => {
    const quote = quoteLease(
      { listPriceCents: priceCents, downPaymentCents: 0, termMonths, vatPercent },
      table
    );
    return quote.ok ? quote.quote.monthlyNetCents : null;
  };
  const leasable = leasableCondition(conditionAfter, asset.category, demand, today);
  const ranked = rankWaitingList(
    { category: asset.category, condition: conditionAfter },
    monthlyFor,
    demand,
    today
  );
  const blocked = !plan.ok
    ? t('secondLife.blocked.plan')
    : !repairs.ok
      ? t('secondLife.blocked.repairs')
      : !leasable
        ? t('secondLife.tooLow')
        : priceCents <= 0
          ? t('secondLife.blocked.price')
          : null;

  async function putBack() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/second-life/${asset.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conditionFound: found,
          usageFound,
          conditionAfter,
          presetIds: presets,
          customRepairs,
          priceCents,
          notes: notes.trim() || null,
        }),
      });
      if (!response.ok) throw new Error('refused');
      router.push(`/${props.locale}/admin/second-life`);
      router.refresh();
    } catch {
      setError(t('secondLife.failed'));
      setBusy(false);
    }
  }

  const togglePreset = (id: string) =>
    setPresets((current) =>
      current.includes(id) ? current.filter((p) => p !== id) : [...current, id]
    );
  const setCustomLine = (index: number, change: Partial<CustomLine>) =>
    setCustom((current) => current.map((line, i) => (i === index ? { ...line, ...change } : line)));

  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={panel}>
          <h2 className="text-lg font-semibold">{t('secondLife.check')}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              {t('secondLife.conditionFound')}
              <select
                value={found}
                onChange={(event) => {
                  setFound(event.target.value as AssetCondition);
                  setPriceEuros(null);
                }}
                className={field}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {conditionName(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              {t('secondLife.usageFound', {
                unit: t(`secondLife.unit.${asset.usage.unit}`),
              })}
              <input
                type="number"
                min={0}
                step={1}
                value={usageText}
                onChange={(event) => {
                  setUsageText(event.target.value);
                  setPriceEuros(null);
                }}
                className={field}
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-stone-500">{t('secondLife.modifiersNote')}</p>

          <h3 className="mt-6 text-base font-semibold">{t('secondLife.refurbish')}</h3>
          <label className="mt-3 block text-sm font-medium">
            {t('secondLife.conditionAfter')}
            <select
              value={conditionAfter}
              onChange={(event) => {
                setAfter(event.target.value as AssetCondition);
                setPriceEuros(null);
              }}
              className={field}
            >
              {afterOptions.map((c) => (
                <option key={c} value={c}>
                  {conditionName(c)}
                </option>
              ))}
            </select>
          </label>
          {!leasable ? (
            <p className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-300">
              {t('secondLife.tooLow')}
            </p>
          ) : null}

          <h4 className="mt-5 text-sm font-semibold">{t('secondLife.jobs')}</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {plan.ok && plan.steps.length > 0 ? (
              plan.steps.map((step) => (
                <li key={step.id} className="flex justify-between gap-3">
                  <span>
                    🔒 {jobLabel(step.id, t)}{' '}
                    <span className="text-xs text-stone-500">
                      ({t(`secondLife.reason.${step.reason}`)})
                    </span>
                  </span>
                  <span className="tabular-nums">{euro(step.costCents)}</span>
                </li>
              ))
            ) : (
              <li className="text-stone-500">{t('secondLife.noJobs')}</li>
            )}
          </ul>

          <h4 className="mt-5 text-sm font-semibold">{t('secondLife.presets')}</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {REPAIR_PRESETS[asset.category].map((preset) => (
              <li key={preset.id}>
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={presets.includes(preset.id)}
                      onChange={() => togglePreset(preset.id)}
                      className="size-4 accent-emerald-700"
                    />
                    {label(`secondLife.repair.${preset.id}`, preset.id, t)}
                  </span>
                  <span className="tabular-nums">{euro(preset.costCents)}</span>
                </label>
              </li>
            ))}
          </ul>

          <h4 className="mt-5 text-sm font-semibold">{t('secondLife.custom')}</h4>
          <ul className="mt-2 space-y-2">
            {custom.map((line, index) => (
              <li key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={80}
                  value={line.label}
                  placeholder={t('secondLife.customName')}
                  aria-label={t('secondLife.customName')}
                  onChange={(event) => setCustomLine(index, { label: event.target.value })}
                  className={`${field} mt-0 flex-1`}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.euros}
                  placeholder="€"
                  aria-label={t('secondLife.customCost')}
                  onChange={(event) => setCustomLine(index, { euros: event.target.value })}
                  className={`${field} mt-0 w-28`}
                />
                <button
                  type="button"
                  onClick={() => setCustom((current) => current.filter((_, i) => i !== index))}
                  aria-label={t('secondLife.customRemove')}
                  className="rounded-lg px-2 py-1 text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setCustom((current) => [...current, { label: '', euros: '' }])}
            className="mt-2 text-sm font-medium text-emerald-800 underline dark:text-emerald-300"
          >
            {t('secondLife.customAdd')}
          </button>

          <label className="mt-5 block text-sm font-medium">
            {t('secondLife.notes')}
            <textarea
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t('secondLife.notesHint')}
              className={field}
            />
          </label>
        </section>

        <section className={panel}>
          <h2 className="text-lg font-semibold">{t('secondLife.price')}</h2>
          <dl className="mt-4 space-y-1.5 text-sm tabular-nums">
            <Row label={t('secondLife.original')} value={euro(originalNetCents)} />
            <Row
              label={t('secondLife.age', { months: ageMonths })}
              value={`${formatNumber(
                Math.round(residualPercent(curves.curves[asset.category] ?? [], ageMonths) * 10) /
                  10,
                props.locale
              )} %`}
            />
            <Row label={t('secondLife.valueNow')} value={euro(valueNow)} />
            <Row label={t('secondLife.costRequired')} value={`− ${euro(requiredCents)}`} />
            <Row label={t('secondLife.costRepairs')} value={`− ${euro(repairCents)}`} />
            <Row label={t('secondLife.valueAfter')} value={euro(valueAfter)} strong />
            <Row
              label={gain >= 0 ? t('secondLife.worthIt') : t('secondLife.notWorthIt')}
              value={euro(Math.abs(gain))}
            />
          </dl>
          <label className="mt-5 block text-sm font-medium">
            {t('secondLife.newPrice', { suggested: euro(suggested) })}
            <input
              type="number"
              min={1}
              step="1"
              value={priceEuros ?? String(suggested / 100)}
              onChange={(event) => setPriceEuros(event.target.value)}
              className={field}
            />
          </label>
          <p className="mt-3 text-sm text-stone-700 dark:text-stone-300">
            {leaseTerms(table)
              .map((months) => {
                const monthly = monthlyFor(months);
                return `${months} ${t('secondLife.monthsShort')}: ${monthly === null ? '–' : euro(monthly)}`;
              })
              .join(' · ')}
          </p>

          <h3 className="mt-5 text-sm font-semibold">{t('secondLife.waiting')}</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {ranked.map((fit) => (
              <li key={fit.request.id} className={fit.fits ? 'font-medium' : 'text-stone-500'}>
                {fit.fits ? '✓' : '✗'} {fit.request.id} · {fit.request.who} ·{' '}
                {t('secondLife.wants', {
                  months: fit.request.preferred_term_months,
                  budget: euro(fit.request.max_monthly_net_rent_cents),
                  condition: t(`condition.${fit.request.min_condition}`),
                  date: fit.request.needed_by,
                })}
                {fit.monthlyNetCents !== null ? ` → ${euro(fit.monthlyNetCents)}` : ''}
                {fit.problems.length > 0
                  ? ` (${fit.problems.map((p) => t(`secondLife.problem.${p}`)).join(', ')})`
                  : ''}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">{t('secondLife.rankingRule')}</p>
        </section>
      </div>

      <section
        aria-labelledby="confirm-heading"
        className="mt-6 rounded-2xl border-2 border-emerald-600 bg-emerald-50 p-6 dark:border-emerald-500 dark:bg-emerald-950"
      >
        <h2 id="confirm-heading" className="text-lg font-semibold">
          {t('secondLife.confirmTitle')}
        </h2>
        <p className="mt-2">
          {t('secondLife.confirmSummary', {
            condition: t(`condition.${conditionAfter}`),
            price: euro(priceCents),
            cost: euro(costCents),
          })}{' '}
          {props.heldForName
            ? t('secondLife.confirmReserved', { name: props.heldForName })
            : t('secondLife.confirmAvailable')}
        </p>
        {blocked ? (
          <p className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-300">{blocked}</p>
        ) : null}
        <button
          type="button"
          disabled={busy || blocked !== null}
          onClick={() => void putBack()}
          className="mt-4 rounded-lg bg-emerald-700 px-6 py-3 font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {props.heldForName
            ? t('secondLife.reserveFor', { name: props.heldForName, price: euro(priceCents) })
            : t('secondLife.putBack', { price: euro(priceCents) })}
        </button>
        {error ? (
          <p role="alert" className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-300">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'font-semibold' : ''}`}>
      <dt className={strong ? '' : 'text-stone-600 dark:text-stone-400'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
