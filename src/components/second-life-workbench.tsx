'use client';

// Admin, Second life: check a returned item and give it a new life. Pick the condition after
// refurbishment, add extra repairs and notes; the value, the jobs it needs, the suggested
// price, the monthly rents and the matching waiting-list entries update as you go. All maths
// is in src/domain/second-life.ts and pricing.ts; the server checks it all again.
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
  isStaff: boolean;
  locale: Locale;
};

const field =
  'mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950';

function stepLabel(id: string, t: Translate): string {
  const upgrade = /^([a-z_]+)->([a-z_]+)$/.exec(id);
  if (upgrade) {
    return t('secondLife.step.upgrade', {
      from: t(`condition.${upgrade[1] as AssetCondition}`),
      to: t(`condition.${upgrade[2] as AssetCondition}`),
    });
  }
  const key = `secondLife.step.${id}`;
  return key in messages.en ? t(key as MessageKey) : id;
}

export function SecondLifeWorkbench(props: WorkbenchProps) {
  const { asset, originalNetCents, ageMonths, curves, costs, demand, table, vatPercent, today } =
    props;
  const t = getT(props.locale);
  const router = useRouter();
  const euro = (cents: number) => formatEuro(cents, intlLocale[props.locale]);
  const startCondition: AssetCondition =
    conditionRank(asset.condition) >= conditionRank('good') ? asset.condition : 'good';
  const [conditionAfter, setConditionAfter] = useState<AssetCondition>(startCondition);
  const [extraEuros, setExtraEuros] = useState('');
  const [notes, setNotes] = useState('');
  const [priceEuros, setPriceEuros] = useState<string | null>(null); // null = use the suggestion
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = (condition: AssetCondition, usage: number) =>
    marketValueCents(
      { originalNetCents, category: asset.category, ageMonths, condition, usage },
      curves
    );
  const plan = refurbishmentPlan(
    {
      category: asset.category,
      before: asset.condition,
      after: conditionAfter,
      usage: asset.usage.value,
    },
    costs
  );
  const extraCents = Math.round(Number(extraEuros.replace(',', '.') || '0') * 100) || 0;
  const valueNow = value(asset.condition, asset.usage.value);
  const valueAfter = plan.ok ? value(conditionAfter, plan.usageAfter) : valueNow;
  const costCents = (plan.ok ? plan.costCents : 0) + extraCents;
  const gain = valueAfter - valueNow - costCents;
  const suggested = roundToEuros(valueAfter);
  const priceCents =
    priceEuros === null ? suggested : Math.round(Number(priceEuros.replace(',', '.')) * 100) || 0;
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
  const options = CONDITIONS.filter(
    (c) =>
      conditionRank(c) >= conditionRank(asset.condition) &&
      (c !== 'new' || asset.condition === 'new')
  );

  async function putBack() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/second-life/${asset.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conditionAfter,
          extraCostCents: extraCents,
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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <h2 className="text-lg font-semibold">{t('secondLife.check')}</h2>
        <label className="mt-4 block text-sm font-medium">
          {t('secondLife.conditionAfter')}
          <select
            value={conditionAfter}
            onChange={(event) => {
              setConditionAfter(event.target.value as AssetCondition);
              setPriceEuros(null);
            }}
            className={field}
          >
            {options.map((c) => (
              <option key={c} value={c}>
                {t(`condition.${c}`)}
              </option>
            ))}
          </select>
        </label>
        {!leasable ? (
          <p className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-300">
            {t('secondLife.tooLow')}
          </p>
        ) : null}

        <h3 className="mt-5 text-sm font-semibold">{t('secondLife.jobs')}</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {plan.ok
            ? plan.steps.map((step) => (
                <li key={step.id} className="flex justify-between gap-3">
                  <span>
                    ✓ {stepLabel(step.id, t)}{' '}
                    <span className="text-xs text-stone-500">
                      ({t(`secondLife.reason.${step.reason}`)})
                    </span>
                  </span>
                  <span className="tabular-nums">{euro(step.costCents)}</span>
                </li>
              ))
            : null}
        </ul>
        <label className="mt-4 block text-sm font-medium">
          {t('secondLife.extra')}
          <input
            type="number"
            min={0}
            step="0.01"
            value={extraEuros}
            onChange={(e) => setExtraEuros(e.target.value)}
            className={field}
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          {t('secondLife.notes')}
          <textarea
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('secondLife.notesHint')}
            className={field}
          />
        </label>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <h2 className="text-lg font-semibold">{t('secondLife.price')}</h2>
        <dl className="mt-4 space-y-1.5 text-sm tabular-nums">
          <Row label={t('secondLife.original')} value={euro(originalNetCents)} />
          <Row
            label={t('secondLife.age', { months: ageMonths })}
            value={`${formatNumber(Math.round(residualPercent(curves.curves[asset.category] ?? [], ageMonths) * 10) / 10, props.locale)} %`}
          />
          <Row label={t('secondLife.valueNow')} value={euro(valueNow)} />
          <Row label={t('secondLife.cost')} value={`− ${euro(costCents)}`} />
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

        {props.isStaff ? (
          <button
            type="button"
            disabled={busy || !plan.ok || !leasable || priceCents <= 0}
            onClick={() => void putBack()}
            className="mt-6 w-full rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {props.heldForName
              ? t('secondLife.reserveFor', { name: props.heldForName, price: euro(priceCents) })
              : t('secondLife.putBack', { price: euro(priceCents) })}
          </button>
        ) : (
          <p className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            {t('admin.staffOnly')}
          </p>
        )}
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
