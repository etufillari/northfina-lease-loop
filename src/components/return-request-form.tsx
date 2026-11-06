'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  answerOptions,
  categoryChecks,
  type CheckAnswer,
  type ConditionAnswers,
} from '@/domain/condition-report';
import { batteryAssessment } from '@/domain/laptop-parts';
import { returnPreview, type ReturnPreviewContext } from '@/domain/return-preview';
import { checkoutQuote } from '@/domain/checkout-quote';
import { formatEuro } from '@/domain/money';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { CheckoutData } from '@/server/checkout-options';
import { ConditionChoice } from './condition-choice';
import { ProductPhoto } from './product-photo';
import { ProgressBar } from './progress-bar';
import { ReturnBreakdown, repairLineLabel } from './return-breakdown';
import { ReturnCalculator } from './return-calculator';

type Props = {
  locale: Locale;
  contractId: string;
  name: string;
  assetId: string;
  data: ReturnPreviewContext;
  baselineUsage: number;
  usageValue: number;
  usageUnit: string;
  today: string;
  mode?: 'return' | 'exchange';
  replacements?: CheckoutData;
};
const field = 'mt-3 min-h-target w-full rounded-sm border border-hairline bg-canvas px-4 py-3';
export function ReturnRequestForm({
  locale,
  contractId,
  name,
  assetId,
  data,
  baselineUsage,
  usageValue,
  usageUnit,
  today,
  mode = 'return',
  replacements,
}: Props) {
  const t = getT(locale);
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const category = data.recoveryFacts.category;
  const steps = [
    ...(mode === 'exchange' ? ['replacement'] : []),
    ...(category === 'laptop' ? [] : ['usage', 'power']),
    ...(category !== 'farm_machine' ? ['battery'] : []),
    'functions',
    'cosmetic',
    'review',
  ];
  const [index, setIndex] = useState(0);
  const [usageInput, setUsageInput] = useState(String(usageValue));
  const usage = usageInput === '' ? Number.NaN : Number(usageInput);
  const [power, setPower] = useState<CheckAnswer | null>(null);
  const [battery, setBattery] = useState<'known' | 'unknown' | null>(null);
  const [health, setHealth] = useState('');
  const [functions, setFunctions] = useState<Record<string, CheckAnswer>>({});
  const [cosmetic, setCosmetic] = useState<ConditionAnswers['cosmetic'] | null>(null);
  const [accessories, setAccessories] = useState<ConditionAnswers['accessories'] | null>(null);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [replacementId, setReplacementId] = useState('');
  const [term, setTerm] = useState(36);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const step = steps[index];
  const answerLabel = (key: string, answer: CheckAnswer) =>
    t((answer === 'unknown' ? 'flow.answer.unknown' : `flow.part.${key}.${answer}`) as MessageKey);
  const currency = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const answers: ConditionAnswers = {
    power: power ?? 'unknown',
    batteryKnown: battery === 'known',
    batteryHealth: battery === 'known' && health !== '' ? Number(health) : null,
    functions: Object.fromEntries(
      categoryChecks[category].map((key) => [key, functions[key] ?? 'unknown'])
    ),
    cosmetic: cosmetic ?? 'same',
    accessories: accessories ?? 'unknown',
  };
  let estimate: ReturnType<typeof returnPreview> | null = null;
  try {
    estimate = returnPreview(data, answers, usage);
  } catch {
    /* Incomplete numeric inputs do not create an invented quote. */
  }
  const replacement = replacements?.options.find((item) => item.id === replacementId);
  const newQuote =
    replacement && replacements
      ? checkoutQuote(
          replacement.priceCents,
          0,
          term,
          today,
          replacements.table,
          replacements.rates
        )
      : null;
  const valid =
    step === 'replacement'
      ? Boolean(replacement?.available && newQuote)
      : step === 'usage'
        ? Number.isSafeInteger(usage) && usage >= usageValue && usage <= 100000000
        : step === 'power'
          ? power !== null
          : step === 'battery'
            ? battery === 'unknown' ||
              (battery === 'known' &&
                health !== '' &&
                Number.isInteger(Number(health)) &&
                Number(health) >= 0 &&
                Number(health) <= 100)
            : step === 'functions'
              ? categoryChecks[category].every((key) => Boolean(functions[key]))
              : step === 'cosmetic'
                ? cosmetic !== null && accessories !== null
                : date >= today && Boolean(estimate);
  function move(next: number) {
    setIndex(next);
    setError(false);
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function submit() {
    if (!valid || !estimate || busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/leases/${encodeURIComponent(contractId)}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: mode,
          report: {
            condition: estimate.condition,
            usageValue: usage,
            issues: estimate.issues,
            notes,
            preferredDate: date,
            answers,
            ...(mode === 'exchange'
              ? { replacement: { id: replacementId, termMonths: term, downPaymentCents: 0 } }
              : {}),
          },
        }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.push(`/${locale}/account/leases/${encodeURIComponent(contractId)}`);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-6">
      <div className="mb-8 flex items-center gap-4">
        <button
          type="button"
          disabled={index === 0 || busy}
          onClick={() => move(index - 1)}
          aria-label={t('flow.back')}
          className="min-h-target min-w-target rounded-pill hover:bg-parchment disabled:opacity-30"
        >
          ←
        </button>
        <ProgressBar label={t('flow.progress')} value={index + 1} max={steps.length} />
        <span className="shrink-0 text-caption tabular-nums">
          {index + 1}/{steps.length}
        </span>
      </div>
      <div className="grid items-start gap-8 desktop:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="space-y-4 desktop:sticky desktop:top-40">
          <div className="rounded-lg border border-hairline p-5">
            <p className="text-caption text-ink-muted">{t('flow.returnTotal')}</p>
            <p className="mt-2 text-display-sm font-semibold text-primary">
              {estimate ? currency(estimate.returnTotalCents) : '—'}
            </p>
            <p className="mt-2 text-fine text-ink-muted">{t('flow.provisional')}</p>
          </div>
          <div className="rounded-lg bg-parchment p-5">
            <div className="flex items-center gap-3">
              <div className="w-16 shrink-0">
                <ProductPhoto
                  assetId={assetId}
                  productName={name}
                  locale={locale}
                  sizes="64px"
                  showCaption={false}
                />
              </div>
              <p className="font-semibold">{name}</p>
            </div>
            <p className="mt-4 text-caption text-ink-muted">
              {t('flow.baseline')}:{' '}
              <span className="font-semibold text-ink">
                {t(`condition.${data.baselineCondition}`)}
              </span>
              {category !== 'laptop' ? (
                <>
                  {' '}
                  · {baselineUsage} {t(`return.unit.${usageUnit}` as MessageKey)}
                </>
              ) : null}
            </p>
            <p className="mt-2 text-fine text-ink-muted">{t('flow.damageNote')}</p>
          </div>
        </aside>
        <section className="min-w-0 rounded-lg border border-hairline p-5 sm:p-8">
          <h3
            ref={heading}
            tabIndex={-1}
            className="text-display-sm font-semibold text-primary outline-none"
          >
            {t(`flow.step.${step}` as MessageKey)}
          </h3>
          <p className="mt-3 text-body text-ink-muted">{t(`flow.help.${step}` as MessageKey)}</p>
          <fieldset disabled={busy} className="mt-7 space-y-4">
            {step === 'replacement' ? (
              <>
                <div className="grid max-h-[420px] gap-3 overflow-y-auto sm:grid-cols-2">
                  {replacements?.options
                    .filter(
                      (item) =>
                        item.available &&
                        item.id !== assetId &&
                        checkoutQuote(
                          item.priceCents,
                          0,
                          term,
                          today,
                          replacements.table,
                          replacements.rates
                        )
                    )
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={replacementId === item.id}
                        onClick={() => setReplacementId(item.id)}
                        className={`flex items-center gap-3 rounded-lg border p-3 text-left ${replacementId === item.id ? 'border-primary bg-primary/5' : 'border-hairline'}`}
                      >
                        <div className="w-16 shrink-0">
                          <ProductPhoto
                            assetId={item.id}
                            productName={item.name}
                            locale={locale}
                            sizes="64px"
                            showCaption={false}
                          />
                        </div>
                        <span className="text-caption font-semibold">{item.name}</span>
                      </button>
                    ))}
                </div>
                <label className="block text-caption font-semibold">
                  {t('product.term')}
                  <select
                    value={term}
                    onChange={(event) => setTerm(Number(event.target.value))}
                    className={field}
                  >
                    {[12, 24, 36, 48, 60].map((months) => (
                      <option key={months} value={months}>
                        {t('product.months', { count: months })}
                      </option>
                    ))}
                  </select>
                </label>
                {newQuote ? (
                  <p className="font-semibold">
                    {t('flow.newMonthly')}: {currency(newQuote.monthlyTotalCents)}
                  </p>
                ) : null}
              </>
            ) : null}
            {step === 'usage' ? (
              <label className="block text-caption font-semibold">
                {t('return.usage', { unit: t(`return.unit.${usageUnit}` as MessageKey) })}
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={9}
                  value={usageInput}
                  onChange={(event) => {
                    if (/^\d*$/.test(event.target.value)) setUsageInput(event.target.value);
                  }}
                  className={field}
                />
                <span className="mt-3 block font-normal text-ink-muted">
                  {t('return.usageHint')}
                </span>
              </label>
            ) : null}
            {step === 'power'
              ? answerOptions('power').map((value) => (
                  <ConditionChoice
                    key={value}
                    selected={power === value}
                    onClick={() => setPower(value)}
                    label={answerLabel('power', value)}
                  />
                ))
              : null}
            {step === 'battery' ? (
              <>
                <ConditionChoice
                  selected={battery === 'known'}
                  onClick={() => setBattery('known')}
                  label={t('flow.batteryKnown')}
                >
                  {
                    <label className="mt-3 flex items-center gap-3">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={health}
                        onChange={(event) => setHealth(event.target.value)}
                        aria-label={t('flow.batteryKnown')}
                        className={field}
                      />
                      <span>%</span>
                    </label>
                  }
                </ConditionChoice>
                <ConditionChoice
                  selected={battery === 'unknown'}
                  onClick={() => setBattery('unknown')}
                  label={t('flow.unable')}
                  description={t('flow.unknownNote')}
                />
                {category === 'laptop' && battery === 'known' && health !== '' ? (
                  <p role="status" className="rounded-sm bg-parchment p-4 text-caption">
                    {t(
                      batteryAssessment(Number(health), data.recoveryFacts.ageMonths).customerPays
                        ? 'flow.battery.charged'
                        : batteryAssessment(Number(health), data.recoveryFacts.ageMonths)
                              .needsReplacement
                          ? 'flow.battery.normal'
                          : 'flow.battery.fine',
                      { months: data.recoveryFacts.ageMonths }
                    )}
                  </p>
                ) : null}
              </>
            ) : null}
            {step === 'functions'
              ? categoryChecks[category].map((key) => (
                  <fieldset key={key} className="rounded-lg border border-hairline p-4">
                    <legend className="px-1 text-caption font-semibold">
                      {t(`flow.check.${key}` as MessageKey)}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {answerOptions(key).map((answer) => (
                        <button
                          key={answer}
                          type="button"
                          aria-pressed={functions[key] === answer}
                          onClick={() => setFunctions({ ...functions, [key]: answer })}
                          className={`min-h-target rounded-pill border px-4 text-caption ${functions[key] === answer ? 'border-primary bg-primary/5 text-primary' : 'border-hairline'}`}
                        >
                          {answerLabel(key, answer)}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ))
              : null}
            {step === 'cosmetic' ? (
              <>
                <div className="space-y-3">
                  {(['same', 'light', 'deep', 'broken'] as const).map((value) => (
                    <ConditionChoice
                      key={value}
                      selected={cosmetic === value}
                      onClick={() => setCosmetic(value)}
                      label={t(`flow.cosmetic.${value}`)}
                    />
                  ))}
                </div>
                <h4 className="pt-4 font-semibold">{t('flow.accessories')}</h4>
                {(['complete', 'missing', 'unknown'] as const).map((value) => (
                  <ConditionChoice
                    key={value}
                    selected={accessories === value}
                    onClick={() => setAccessories(value)}
                    label={t(`flow.accessories.${value}`)}
                  />
                ))}
              </>
            ) : null}
            {step === 'review' ? (
              <>
                <div className="rounded-lg bg-parchment p-5">
                  <p className="text-caption text-ink-muted">{t('flow.returnTotal')}</p>
                  <p className="mt-2 text-display-sm font-semibold">
                    {estimate ? currency(estimate.returnTotalCents) : '—'}
                  </p>
                  {estimate ? (
                    <ReturnBreakdown
                      locale={locale}
                      currency={currency}
                      data={{
                        showEarly: estimate.remainingMonths > 0,
                        earlyCents: estimate.earlyReturnTotalCents,
                        repairSharePercent: estimate.repairSharePercent,
                        repairCents: estimate.customerRepairTotalCents,
                        lines: estimate.lines.map((line) => ({
                          key: line.id,
                          label: t(repairLineLabel(line.id)),
                          cents: line.totalCents,
                        })),
                        unpaidCents: estimate.unpaidCents,
                      }}
                    />
                  ) : null}
                  {replacement && newQuote ? (
                    <div className="mt-5 border-t border-hairline pt-4">
                      <p className="font-semibold">{replacement.name}</p>
                      <p className="mt-2">
                        {t('flow.newMonthly')}: {currency(newQuote.monthlyTotalCents)}
                      </p>
                      <p className="mt-2 text-caption">
                        {t('product.months', { count: term })} · {t('flow.replacementNote')}
                      </p>
                    </div>
                  ) : null}
                </div>
                <ReturnCalculator
                  locale={locale}
                  data={data}
                  answers={answers}
                  usage={usage}
                  currency={currency}
                />
                <label className="block text-caption font-semibold">
                  {t('return.preferredDate')}
                  <input
                    type="date"
                    min={today}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className={field}
                  />
                </label>
                <label className="block text-caption font-semibold">
                  {t('return.notes')}
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className={field}
                  />
                </label>
                <p className="text-caption text-ink-muted">{t('return.reviewNote')}</p>
              </>
            ) : null}
          </fieldset>
          {error ? (
            <p role="alert" className="mt-4 text-caption">
              {t('return.submitError')}
            </p>
          ) : null}
          <div className="mt-8 flex justify-end">
            <button
              type="button"
              disabled={!valid || busy}
              onClick={() => (index === steps.length - 1 ? void submit() : move(index + 1))}
              className="pressable inline-flex min-h-target items-center gap-4 rounded-pill bg-primary px-7 py-3 font-semibold text-white disabled:opacity-40"
            >
              {t(
                busy
                  ? 'auth.working'
                  : index === steps.length - 1
                    ? 'return.submit'
                    : 'flow.continue'
              )}{' '}
              →
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
