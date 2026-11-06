'use client';

import { useState, type FormEvent } from 'react';
import type { AssetCategory, AssetCondition } from '@/data/schemas';
import { parseEuroCents } from '@/domain/application-fields';
import { netFromGross } from '@/domain/gross-money';
import {
  batteryIsRepairLine,
  checkResults,
  conditionsUpTo,
  evaluateInspection,
  inspectionChecks,
  inspectionReadings,
  reportedCheckIds,
  reportedRepairCents,
  type CheckGate,
  type CheckResult,
  type InspectionRecord,
} from '@/domain/inspection';
import { conditionDamageCost } from '@/domain/condition-report';
import { batteryAssessment, inspectionPartCost } from '@/domain/laptop-parts';
import { invoiceAmounts } from '@/domain/lease-billing';
import { assessmentPreview, type ReturnPreviewContext } from '@/domain/return-preview';
import { formatEuro } from '@/domain/money';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { RecoveryInspection } from '@/server/recovery-input';
import { DamageLog, type DamageState } from './damage-log';
import { inputClass, primaryButtonClass } from './form-classes';

const groups: readonly { id: string; gates: readonly CheckGate[] }[] = [
  { id: 'identity', gates: ['identity', 'condition'] },
  { id: 'safety', gates: ['structural', 'safety'] },
  { id: 'function', gates: ['function'] },
];

type CheckState = { result: CheckResult | ''; repair: string; note: string; chargeable: boolean };

type Props = {
  locale: Locale;
  category: AssetCategory;
  reportedIssues: readonly string[];
  reportedCondition: AssetCondition | null;
  reportedUsage: number | null;
  inspection: RecoveryInspection | null;
  currentUsage: number;
  recordedAge: number | null;
  defaultAge: number;
  vatBasisPoints: number;
  returnContext: ReturnPreviewContext | null;
  /** The price from the customer's return form, which this inspection does not change. */
  agreed: { totalCents: number; lines: readonly { id: string; netCents: number }[] } | null;
  busy: boolean;
  failed: boolean;
  onSubmit: (body: unknown) => void;
};

/** Identity and accessories are yes-or-no questions, so wear and "not applicable" make no sense. */
function resultAllowed(id: string, gate: CheckGate, result: CheckResult) {
  if (gate === 'identity' || id === 'accessories_complete')
    return ['pass', 'repair', 'not_tested'].includes(result);
  return true;
}

export function InspectionForm({
  locale,
  category,
  reportedIssues,
  reportedCondition,
  reportedUsage,
  inspection,
  currentUsage,
  recordedAge,
  defaultAge,
  vatBasisPoints,
  returnContext,
  agreed,
  busy,
  failed,
  onSubmit,
}: Props) {
  const t = getT(locale);
  const saved = inspection?.record;
  const money = (net: number) => (invoiceAmounts(net, vatBasisPoints).totalCents / 100).toFixed(2);
  const definitions = inspectionChecks(category);
  const readingDefinitions = inspectionReadings(category);
  const reported = new Set(reportedCheckIds(category, reportedIssues));

  const [usage, setUsage] = useState(
    String(inspection?.usageValue ?? Math.max(currentUsage, reportedUsage ?? 0))
  );
  const [customerPresent, setCustomerPresent] = useState(saved?.customerPresent ?? false);
  const [checks, setChecks] = useState<Record<string, CheckState>>(() =>
    Object.fromEntries(
      definitions.map(({ id }) => {
        const check = saved?.checks.find((item) => item.id === id);
        return [
          id,
          {
            result: check?.result ?? '',
            repair: check?.repairCents ? money(check.repairCents) : '',
            note: check?.note ?? '',
            chargeable: check?.chargeable ?? true,
          },
        ];
      })
    )
  );
  const [readings, setReadings] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      readingDefinitions.map(({ id }) => {
        const value = saved?.readings.find((item) => item.id === id)?.value;
        return [id, value === undefined || value === null ? '' : String(value)];
      })
    )
  );
  const [damage, setDamage] = useState<DamageState[]>(() =>
    (saved?.damage ?? []).map((entry) => ({
      area: entry.area,
      type: entry.type,
      liability: entry.liability,
      repair: entry.repairCents ? money(entry.repairCents) : '',
    }))
  );
  const [condition, setCondition] = useState<AssetCondition>(
    inspection?.condition ?? reportedCondition ?? 'good'
  );
  const [targetCondition, setTargetCondition] = useState<'good' | 'like_new'>(
    inspection?.targetCondition ?? 'good'
  );

  /** A blank amount means no cost; anything unreadable makes the record invalid. */
  function netCents(text: string): number {
    if (!text.trim()) return 0;
    const gross = parseEuroCents(text);
    return gross === null ? -1 : netFromGross(gross, vatBasisPoints);
  }
  const record: InspectionRecord = {
    customerPresent,
    checks: definitions.flatMap(({ id }) => {
      const check = checks[id]!;
      return check.result
        ? [
            {
              id,
              result: check.result,
              // Costs entered before changing a result away from repair no longer apply.
              repairCents: check.result === 'repair' ? netCents(check.repair) : 0,
              note: check.note.trim(),
              chargeable: check.chargeable,
            },
          ]
        : [];
    }),
    readings: readingDefinitions.map(({ id }) => {
      const text = readings[id]!.trim();
      return { id, value: text === '' ? null : Number(text.replace(',', '.')) };
    }),
    damage: damage.map((entry) => ({
      area: entry.area.trim(),
      type: entry.type,
      liability: entry.liability,
      repairCents: netCents(entry.repair),
    })),
  };
  const findings = evaluateInspection(category, record);
  const ageForBattery = recordedAge ?? inspection?.ageMonths ?? defaultAge;
  const batteryReading = record.readings.find((item) => item.id === 'battery_health')?.value;
  const battery =
    category === 'laptop' && typeof batteryReading === 'number' && Number.isFinite(batteryReading)
      ? batteryAssessment(batteryReading, ageForBattery)
      : null;
  const batteryCost =
    returnContext?.costs.laptop?.fixed.find((task) => task.id === 'battery_replacement')
      ?.cost_cents ?? null;
  const allowed = conditionsUpTo(findings.conditionCap);
  // The grade follows the findings down automatically, and never silently back up.
  const grade = allowed.includes(condition) ? condition : findings.conditionCap;
  const currency = (net: number) =>
    formatEuro(invoiceAmounts(Math.max(0, net), vatBasisPoints).totalCents, intlLocale[locale]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      action: 'assess',
      condition: grade,
      targetCondition,
      usageValue: Number(usage),
      ageMonths: Number(data.get('ageMonths')),
      notes: data.get('notes'),
      record,
    });
  }
  const setReading = (id: string, value: string) => {
    if (/^\d*[.,]?\d*$/.test(value)) setReadings((current) => ({ ...current, [id]: value }));
  };
  const resultLabel = (id: string, result: CheckResult) =>
    t(
      (['serial_match', 'accessories_complete'].includes(id) && result !== 'not_applicable'
        ? `inspection.result.${id}.${result}`
        : `inspection.result.${result}`) as MessageKey
    );
  /** Choosing "needs repair" suggests what the customer was quoted, or else the usual cost. */
  function chooseResult(id: string, result: CheckResult) {
    const usual =
      !returnContext || category !== 'laptop'
        ? null
        : id === 'battery_pack'
          ? batteryCost
          : inspectionPartCost(id, returnContext.recoveryFacts.originalPriceCents);
    const suggested =
      result === 'repair' ? (reportedRepairCents(id, agreed?.lines ?? []) ?? usual) : null;
    setChecks((current) => {
      const check = current[id]!;
      return {
        ...current,
        [id]: {
          ...check,
          result,
          repair: suggested !== null && !check.repair ? money(suggested) : check.repair,
          chargeable: id === 'battery_pack' && battery ? battery.customerPays : check.chargeable,
        },
      };
    });
  }
  const setCheck = (id: string, change: Partial<CheckState>) =>
    setChecks((current) => ({ ...current, [id]: { ...current[id]!, ...change } }));
  const answered = definitions.length - findings.missingChecks.length;
  const live =
    returnContext &&
    assessmentPreview(returnContext, {
      condition: grade,
      targetCondition,
      usageValue: Number(usage),
      additionalRepairCents: Math.max(0, findings.repairNetCents),
      damageNetCents: Math.max(
        conditionDamageCost(returnContext.baselineCondition, grade, returnContext.costs[category]),
        findings.chargeableNetCents
      ),
      skipBatteryTask: batteryIsRepairLine(record),
    });

  return (
    <form onSubmit={submit} className="rounded-lg border border-hairline p-6">
      <h2 className="text-tagline font-semibold">{t('recovery.inspection')}</h2>
      <p className="mt-3 text-caption text-ink-muted">{t('recovery.inspectionIntro')}</p>
      <fieldset disabled={busy} className="mt-6 space-y-8">
        <section>
          <h3 className="text-caption font-semibold">{t('inspection.section.item')}</h3>
          <div className="mt-3 grid gap-5 sm:grid-cols-2">
            {category === 'laptop' ? (
              <label className="text-caption">
                {t('inspection.reading.battery_health')} ({t('inspection.unit.percent')})
                <input
                  inputMode="numeric"
                  value={readings.battery_health ?? ''}
                  onChange={(event) => setReading('battery_health', event.target.value)}
                  className={inputClass}
                />
              </label>
            ) : (
              <label className="text-caption">
                {t(`product.usage.${category}`)}
                <input
                  inputMode="numeric"
                  value={usage}
                  required
                  onChange={(event) => {
                    if (/^\d*$/.test(event.target.value)) setUsage(event.target.value);
                  }}
                  className={inputClass}
                />
              </label>
            )}
            <label className="text-caption">
              {t('recovery.ageMonths')}
              <input
                name="ageMonths"
                inputMode="numeric"
                pattern="[0-9]*"
                readOnly={recordedAge !== null}
                defaultValue={recordedAge ?? inspection?.ageMonths ?? defaultAge}
                required
                className={inputClass}
              />
            </label>
            <label className="flex min-h-target items-center gap-3 self-end text-caption">
              <input
                type="checkbox"
                checked={customerPresent}
                onChange={(event) => setCustomerPresent(event.target.checked)}
                className="size-4 shrink-0 accent-primary"
              />
              {t('inspection.customerPresent')}
            </label>
          </div>
          {battery ? (
            <p className="mt-3 rounded-sm bg-parchment p-3 text-caption">
              {t(
                !battery.needsReplacement
                  ? 'inspection.battery.fine'
                  : agreed
                    ? 'inspection.battery.agreed'
                    : battery.customerPays
                      ? 'inspection.battery.charge'
                      : 'inspection.battery.normal',
                { months: ageForBattery }
              )}
            </p>
          ) : null}
        </section>

        {groups.map((group) => (
          <section key={group.id}>
            <h3 className="text-caption font-semibold">
              {t(`inspection.section.${group.id}` as MessageKey)}
            </h3>
            <ul className="mt-2 divide-y divide-divider">
              {definitions
                .filter((definition) => group.gates.includes(definition.gate))
                .map(({ id, gate }) => {
                  const check = checks[id]!;
                  return (
                    <li key={id} className="py-4">
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-start">
                        <div>
                          <label htmlFor={`check-${id}`} className="text-body font-semibold">
                            {t(`inspection.check.${id}` as MessageKey)}
                          </label>
                          <p className="mt-1 text-caption text-ink-muted">
                            {t(`inspection.hint.${id}` as MessageKey)}
                          </p>
                          {reported.has(id) ? (
                            <p className="mt-1 text-caption font-semibold">
                              ● {t('inspection.reported')}
                            </p>
                          ) : null}
                        </div>
                        <select
                          id={`check-${id}`}
                          required
                          value={check.result}
                          onChange={(event) => chooseResult(id, event.target.value as CheckResult)}
                          className="min-h-target w-full rounded-sm border border-hairline bg-canvas px-3 py-2 text-caption"
                        >
                          <option value="">{t('inspection.choose')}</option>
                          {checkResults
                            .filter((result) => resultAllowed(id, gate, result))
                            .map((result) => (
                              <option key={result} value={result}>
                                {resultLabel(id, result)}
                              </option>
                            ))}
                        </select>
                      </div>
                      {check.result === 'repair' ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                          <label className="text-caption">
                            {t('inspection.repairCost')}
                            <input
                              inputMode="decimal"
                              value={check.repair}
                              onChange={(event) => setCheck(id, { repair: event.target.value })}
                              className={inputClass}
                            />
                          </label>
                          <label className="text-caption">
                            {t('inspection.repairNote')}
                            <input
                              maxLength={300}
                              value={check.note}
                              onChange={(event) => setCheck(id, { note: event.target.value })}
                              className={inputClass}
                            />
                          </label>
                          {agreed ? null : (
                            <label className="flex min-h-target items-center gap-3 text-caption sm:col-span-2">
                              <input
                                type="checkbox"
                                checked={check.chargeable}
                                onChange={(event) =>
                                  setCheck(id, { chargeable: event.target.checked })
                                }
                                className="size-4 shrink-0 accent-primary"
                              />
                              {t('inspection.customerPaysRepair')}
                            </label>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}

        <section>
          <h3 className="text-caption font-semibold">{t('inspection.section.readings')}</h3>
          <p className="mt-1 text-caption text-ink-muted">{t('inspection.readingsHint')}</p>
          <div className="mt-3 grid gap-5 sm:grid-cols-3">
            {readingDefinitions
              .filter(({ id }) => category !== 'laptop' || id !== 'battery_health')
              .map(({ id, unit }) => (
                <label key={id} className="text-caption">
                  {t(`inspection.reading.${id}` as MessageKey)}
                  {unit === 'count' ? '' : ` (${t(`inspection.unit.${unit}`)})`}
                  <input
                    inputMode="decimal"
                    value={readings[id]}
                    onChange={(event) => setReading(id, event.target.value)}
                    className={inputClass}
                  />
                </label>
              ))}
          </div>
        </section>

        <DamageLog
          locale={locale}
          damage={damage}
          setDamage={setDamage}
          priceAgreed={agreed !== null}
        />

        <section className="rounded-sm bg-parchment p-4">
          <h3 className="text-caption font-semibold">{t('inspection.section.result')}</h3>
          <dl className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-caption text-ink-muted">{t('inspection.progress')}</dt>
              <dd className="mt-1 font-semibold">
                {t('inspection.progressValue', {
                  answered,
                  total: definitions.length,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">{t('inspection.totalRepairs')}</dt>
              <dd className="mt-1 font-semibold">{currency(findings.repairNetCents)}</dd>
            </div>
            {agreed ? null : (
              <div>
                <dt className="text-caption text-ink-muted">{t('inspection.totalChargeable')}</dt>
                <dd className="mt-1 font-semibold">{currency(findings.chargeableNetCents)}</dd>
              </div>
            )}
          </dl>
          {live ? (
            <dl className="mt-4 grid gap-4 border-t border-hairline pt-4 sm:grid-cols-3">
              <div>
                <dt className="text-caption text-ink-muted">
                  {t(agreed ? 'recovery.agreedPrice' : 'recovery.customerPays')}
                </dt>
                <dd className="mt-1 text-tagline font-semibold">
                  {formatEuro(agreed?.totalCents ?? live.customerPaysCents, intlLocale[locale])}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">{t('inspection.live.price')}</dt>
                <dd className="mt-1 text-tagline font-semibold">
                  {currency(live.suggestedPriceNetCents)}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">{t('inspection.live.work')}</dt>
                <dd className="mt-1 text-tagline font-semibold">
                  {currency(live.refurbishmentNetCents)}
                </dd>
              </div>
            </dl>
          ) : null}
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <label className="text-caption">
              {t('recovery.currentCondition')}
              <select
                value={grade}
                onChange={(event) => setCondition(event.target.value as AssetCondition)}
                className={inputClass}
              >
                {allowed.map((value) => (
                  <option key={value} value={value}>
                    {t(`condition.${value}`)}
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-fine text-ink-muted">
                {t('inspection.capNote', { condition: t(`condition.${findings.conditionCap}`) })}
              </span>
            </label>
            <label className="text-caption">
              {t('recovery.targetCondition')}
              <select
                value={targetCondition}
                onChange={(event) => setTargetCondition(event.target.value as 'good' | 'like_new')}
                className={inputClass}
              >
                {(['good', 'like_new'] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`condition.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-caption sm:col-span-2">
              {t('recovery.notes')}
              <textarea
                name="notes"
                maxLength={1000}
                defaultValue={inspection?.notes ?? ''}
                rows={3}
                className={inputClass}
              />
            </label>
          </div>
          {failed ? (
            <p role="alert" className="mt-4 text-caption font-semibold">
              {t('recovery.error')}
            </p>
          ) : null}
          <button type="submit" className={`${primaryButtonClass} mt-5 w-full`}>
            {t(busy ? 'auth.working' : agreed ? 'recovery.sendQuote' : 'recovery.calculate')}
          </button>
        </section>
      </fieldset>
    </form>
  );
}
