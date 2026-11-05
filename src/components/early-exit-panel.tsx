'use client';

// Leave early (D-030): pick any month to see what leaving then costs, line by line, and confirm
// in the current month. The domain runs here for live feedback; the server decides again (D-018).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { assetConditionSchema, type AssetCondition, type UsageUnit } from '@/data/schemas';
import { addMonthsClamped } from '@/domain/calendar';
import {
  earlyExitQuote,
  endEarly,
  exitMonthOn,
  type EarlyExitChoice,
  type EarlyExitQuote,
  type ExitContext,
  type ExitContract,
} from '@/domain/early-exit';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type Kind = EarlyExitChoice['kind'];

export type EarlyExitPanelProps = {
  locale: Locale;
  contractId: number;
  contract: ExitContract;
  context: ExitContext;
  unit: UsageUnit;
  today: string;
};

export function EarlyExitPanel(props: EarlyExitPanelProps) {
  const { locale, contract, context } = props;
  const t = getT(locale);
  const router = useRouter();
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const date = (iso: string) => formatIsoDate(iso, locale);
  const ids = { month: useId(), condition: useId(), usage: useId() };
  const delivered = { condition: context.item.condition, usageValue: context.item.usageValue };

  const current = exitMonthOn(contract, props.today);
  const [month, setMonth] = useState(current.ok ? current.month : 1);
  const [kind, setKind] = useState<Kind>('early_buy');
  const [condition, setCondition] = useState<AssetCondition>(delivered.condition);
  const [usage, setUsage] = useState(String(delivered.usageValue));
  const [saving, setSaving] = useState<'idle' | 'busy' | 'error'>('idle');

  const usageValue = /^\d+$/.test(usage) ? Number(usage) : null;
  const handingBack = kind === 'early_hand_back';
  const item =
    handingBack && usageValue !== null ? { ...context.item, condition, usageValue } : context.item;
  const priced = earlyExitQuote(contract, { ...context, item }, month);
  const quote = priced.ok ? priced.quote : null;

  const choice: EarlyExitChoice | null = !handingBack
    ? { kind }
    : usageValue === null
      ? null
      : { kind, condition, usageValue };
  const decided = choice ? endEarly(contract, context, delivered, choice, props.today) : null;
  const isCurrentMonth = current.ok && current.month === month;
  const problem = isCurrentMonth && decided && !decided.ok ? decided.reason : null;
  const canSave = isCurrentMonth && decided?.ok === true && saving !== 'busy';

  async function save() {
    if (!choice) return;
    setSaving('busy');
    const response = await fetch(`/api/contracts/${props.contractId}/end-early`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(choice),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { success: boolean } | null;
    if (body?.success) {
      router.refresh();
      return;
    }
    setSaving('error');
  }

  return (
    <div className="panel mt-4 max-w-2xl p-5 sm:p-6">
      <label htmlFor={ids.month} className="eyebrow">
        {t('early.month')}
      </label>
      <input
        id={ids.month}
        type="range"
        min={1}
        max={contract.termMonths}
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
        className="range mt-3 w-full"
        aria-valuetext={t('early.monthValue', {
          month,
          term: contract.termMonths,
          date: date(addMonthsClamped(contract.startDate, month)),
        })}
      />
      <p className="mt-2 font-semibold">
        {t('early.monthValue', {
          month,
          term: contract.termMonths,
          date: date(addMonthsClamped(contract.startDate, month)),
        })}
      </p>
      {!isCurrentMonth ? (
        <p className="mt-1 text-sm text-muted">
          {current.ok
            ? t('early.whatIf', { month: current.month })
            : t('early.notStarted', { date: date(contract.startDate) })}
        </p>
      ) : null}

      <fieldset className="mt-5">
        <legend className="eyebrow">{t('early.choose')}</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(['early_buy', 'early_hand_back'] as const).map((k) => (
            <label key={k} className="flex cursor-pointer gap-3 rounded-lg border border-line p-3">
              <input
                type="radio"
                name="early-kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="mt-1"
              />
              <span>
                <span className="font-semibold">{t(`early.kind.${k}`)}</span>
                {quote ? (
                  <span className="mt-0.5 block text-sm text-muted tabular-nums">
                    {euro(k === 'early_buy' ? quote.buy.grossCents : quote.handBack.grossCents)}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {handingBack ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.condition} className="eyebrow">
              {t('condition.label')}
            </label>
            <select
              id={ids.condition}
              value={condition}
              onChange={(e) => setCondition(assetConditionSchema.parse(e.target.value))}
              className="field mt-2"
            >
              {assetConditionSchema.options.map((c) => (
                <option key={c} value={c}>
                  {t(`condition.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.usage} className="eyebrow">
              {t('end.usage', { unit: t(`unit.${props.unit}`) })}
            </label>
            <input
              id={ids.usage}
              inputMode="numeric"
              value={usage}
              onChange={(e) => setUsage(e.target.value.replace(/\s/g, ''))}
              className="field mt-2"
            />
          </div>
        </div>
      ) : null}

      {quote ? (
        <Breakdown
          quote={quote}
          kind={kind}
          rentCents={contract.monthlyNetRentCents}
          locale={locale}
        />
      ) : (
        <p className="mt-4 text-sm text-warn-fg">{t('early.reason.no_vat_rate')}</p>
      )}

      {problem ? (
        <p role="alert" className="mt-4 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          {problem === 'usage_went_down' || problem === 'condition_improved'
            ? t(`end.reason.${problem}`, { condition: t(`condition.${delivered.condition}`) })
            : t(`early.reason.${problem}`)}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={!canSave}
        className="btn-primary mt-6 w-full py-3.5 sm:w-auto sm:px-8"
      >
        {saving === 'busy' ? t('end.saving') : t('early.confirm')}
      </button>
      {saving === 'error' ? (
        <p role="alert" className="mt-2 text-sm text-warn-fg">
          {t('end.error')}
        </p>
      ) : null}
    </div>
  );
}

/** Every line of the price, so the total can be checked by hand. */
function Breakdown(props: {
  quote: EarlyExitQuote;
  kind: Kind;
  rentCents: number;
  locale: Locale;
}) {
  const { quote, kind, locale } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const rate = formatNumber(quote.annualInterestPercent, locale);
  const rent = euro(props.rentCents);
  const price = kind === 'early_buy' ? quote.buy : quote.handBack;
  const endIsBuyout = quote.endAmountCents === quote.buyoutCents;
  const lines: [string, number][] =
    kind === 'early_buy'
      ? [
          [t('early.line.rentsLeft', { count: quote.monthsLeft, rent }), quote.remainingRentsCents],
          [t('early.line.buyout'), quote.buyoutCents],
          [t('early.line.discount', { rate }), -quote.buy.discountCents],
        ]
      : [
          [
            t('early.line.rentsToday', { count: quote.monthsLeft, rent }),
            quote.remainingRentsPvCents,
          ],
          [
            endIsBuyout
              ? t('early.line.endBuyout', { value: euro(quote.valueAtEndCents) })
              : t('early.line.endValue', {
                  value: euro(quote.valueAtEndCents),
                  buyout: euro(quote.buyoutCents),
                }),
            quote.endAmountPvCents,
          ],
          [t('early.line.valueNow'), -quote.valueNowCents],
        ];
  const zeroed =
    kind === 'early_hand_back' &&
    quote.remainingRentsPvCents + quote.endAmountPvCents < quote.valueNowCents;

  return (
    <div className="mt-5">
      <dl className="grid gap-y-1 text-sm tabular-nums">
        {lines.map(([label, cents]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-line py-1.5">
            <dt className="text-muted">{label}</dt>
            <dd>{euro(cents)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-b border-line py-1.5 font-semibold">
          <dt>{t('early.line.net')}</dt>
          <dd>{euro(price.netCents)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-line py-1.5">
          <dt className="text-muted">
            {t('early.line.vat', {
              rate: formatNumber(quote.vatRatePercent, locale),
              date: formatIsoDate(quote.effectiveDate, locale),
            })}
          </dt>
          <dd>{euro(price.vatCents)}</dd>
        </div>
        <div className="flex justify-between gap-4 py-1.5 text-base font-semibold">
          <dt>{t('early.line.gross')}</dt>
          <dd>{euro(price.grossCents)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted">{zeroed ? t('early.zero') : t(`early.why.${kind}`)}</p>
    </div>
  );
}
