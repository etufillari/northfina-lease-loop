'use client';

// Second life (D-035): pick the condition to re-list a returned item at and see, line by line,
// what it is worth, what the refurbishment costs and the new rent. The server values it again.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AssetCondition, UsageUnit } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import type { RefurbishStep } from '@/domain/refurbishment';
import type { SecondLifeOption, ValueLine } from '@/domain/second-life';
import { formatNumber } from '@/i18n/format';
import { getT, type MessageKey, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type RelistFormProps = {
  locale: Locale;
  assetId: string;
  unit: UsageUnit;
  modelYear: number;
  firstLeasePriceListVersion: number;
  options: SecondLifeOption[];
  suggested: AssetCondition;
};

export function RelistForm(props: RelistFormProps) {
  const { locale, options } = props;
  const t = getT(locale);
  const router = useRouter();
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const [target, setTarget] = useState<AssetCondition>(props.suggested);
  const [saving, setSaving] = useState<'idle' | 'busy' | 'error'>('idle');
  const option = options.find((o) => o.target === target) ?? options[0];
  if (!option) return null;
  const { valuation } = option;
  const usage = (value: number) => t(`usage.${props.unit}`, { value: formatNumber(value, locale) });
  const number = (value: number) => formatNumber(value, locale);

  async function relist() {
    setSaving('busy');
    const response = await fetch(`/api/assets/${props.assetId}/relist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { success: boolean } | null;
    if (body?.success) {
      router.refresh();
      return;
    }
    setSaving('error');
  }

  return (
    <div className="panel p-5 sm:p-6">
      <fieldset>
        <legend className="eyebrow">{t('secondLife.chooseCondition')}</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {options.map((o) => (
            <label
              key={o.target}
              className="flex cursor-pointer gap-3 rounded-lg border border-line p-3"
            >
              <input
                type="radio"
                name="relist-target"
                value={o.target}
                checked={o.target === target}
                onChange={() => setTarget(o.target)}
                className="mt-1"
              />
              <span>
                <span className="font-semibold">
                  {t(`condition.${o.target}`)}
                  {o.target === props.suggested ? ` · ${t('secondLife.suggested')}` : ''}
                </span>
                <span className="mt-0.5 block text-sm text-muted tabular-nums">
                  {t('secondLife.optionLine', {
                    price: euro(o.valuation.listPriceCents),
                    cost: euro(o.valuation.refurbishmentCents),
                  })}
                </span>
              </span>
            </label>
          ))}
        </div>
        {options.some((o) => o.target === 'fair') ? (
          <p className="mt-2 text-xs text-muted">{t('secondLife.fairNote')}</p>
        ) : null}
      </fieldset>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="sl-value">
          <h3 id="sl-value" className="eyebrow">
            {t('secondLife.valuationTitle')}
          </h3>
          <dl className="mt-2 grid gap-y-1 text-sm tabular-nums">
            <Row
              label={t('secondLife.firstPrice', { version: props.firstLeasePriceListVersion })}
              value={euro(valuation.firstLeasePriceCents)}
            />
            <Row
              label={t('secondLife.age', { months: valuation.ageMonths, year: props.modelYear })}
              value={`× ${number(valuation.curvePercent)} %`}
            />
          </dl>
          <ValueRows
            t={t}
            title={t('secondLife.asReturned', {
              condition: t(`condition.${valuation.asReturned.condition}`),
              usage: usage(valuation.asReturned.usageValue),
            })}
            line={valuation.asReturned}
            euro={euro}
            number={number}
          />
          <ValueRows
            t={t}
            title={t('secondLife.afterWork', {
              condition: t(`condition.${valuation.after.condition}`),
              usage: usage(valuation.after.usageValue),
            })}
            line={valuation.after}
            euro={euro}
            number={number}
          />
        </section>

        <section aria-labelledby="sl-plan">
          <h3 id="sl-plan" className="eyebrow">
            {t('secondLife.planTitle')}
          </h3>
          <dl className="mt-2 grid gap-y-1 text-sm tabular-nums">
            {valuation.plan.steps.map((step) => (
              <Row key={step.id} label={stepLabel(t, step)} value={euro(step.costCents)} />
            ))}
            <Row
              strong
              label={t('secondLife.planTotal')}
              value={euro(valuation.refurbishmentCents)}
            />
          </dl>
          <p className="mt-2 text-xs text-muted">{t('secondLife.planNote')}</p>

          <h3 className="eyebrow mt-6">{t('secondLife.rentTitle')}</h3>
          <dl className="mt-2 grid gap-y-1 text-sm tabular-nums">
            <Row strong label={t('secondLife.newPrice')} value={euro(valuation.listPriceCents)} />
            {option.rents.map((rent) => (
              <Row
                key={rent.termMonths}
                label={t('secondLife.rentTerm', { count: rent.termMonths })}
                value={
                  rent.monthlyNetRentCents === null
                    ? t('secondLife.rentNone')
                    : euro(rent.monthlyNetRentCents)
                }
              />
            ))}
          </dl>
        </section>
      </div>

      <button
        type="button"
        onClick={() => void relist()}
        disabled={saving === 'busy'}
        className="btn-primary mt-6 w-full py-3.5 sm:w-auto sm:px-8"
      >
        {saving === 'busy'
          ? t('secondLife.relisting')
          : t('secondLife.relist', { price: euro(valuation.listPriceCents) })}
      </button>
      {saving === 'error' ? (
        <p role="alert" className="mt-2 text-sm text-warn-fg">
          {t('secondLife.relistError')}
        </p>
      ) : null}
    </div>
  );
}

/** The data pack's fixed refurbishment steps; an unknown id is shown as it is. */
const FIXED_STEP_KEYS: Record<string, MessageKey> = {
  battery_replacement: 'secondLife.step.battery_replacement',
  safety_inspection: 'secondLife.step.safety_inspection',
  certified_data_wipe: 'secondLife.step.certified_data_wipe',
  major_service: 'secondLife.step.major_service',
};

function stepLabel(t: Translate, step: RefurbishStep): string {
  if (step.kind === 'upgrade') {
    const [from, to] = step.id.split('->') as [AssetCondition, AssetCondition];
    return t('secondLife.step.upgrade', { from: t(`condition.${from}`), to: t(`condition.${to}`) });
  }
  const key = FIXED_STEP_KEYS[step.id];
  const label = key ? t(key) : step.id;
  return step.quantity > 1 ? `${label} × ${step.quantity}` : label;
}

function ValueRows(props: {
  t: Translate;
  title: string;
  line: ValueLine;
  euro: (cents: number) => string;
  number: (value: number) => string;
}) {
  const { t, line } = props;
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold">{props.title}</p>
      <dl className="mt-1 grid gap-y-1 text-sm tabular-nums">
        <Row
          label={t('secondLife.conditionFactor')}
          value={`× ${props.number(line.conditionMultiplier)}`}
        />
        <Row label={t('secondLife.usageFactor')} value={`${props.number(line.usagePercent)} %`} />
        <Row strong label={t('secondLife.value')} value={props.euro(line.valueCents)} />
      </dl>
    </div>
  );
}

function Row(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-4 border-b border-line py-1.5 ${props.strong ? 'font-semibold' : ''}`}
    >
      <dt className={props.strong ? '' : 'text-muted'}>{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  );
}
