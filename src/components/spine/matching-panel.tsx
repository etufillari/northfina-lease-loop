import { useState } from 'react';
import {
  matchingPreviewInputSchema,
  matchingPreviewSchema,
  type MatchingPreview,
  type MatchingSelection,
} from '@/data/second-life-schemas';
import type { MatchCandidate } from '@/domain/second-life-matching';
import { parseCents } from '@/domain/money-arithmetic';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { requestJson } from './api';
import type { DealerWorkspace } from '@/server/spine-dealer';
import { buttonClass, Field, inputClass, messageFor } from './ui';
import { MatchingOverride } from './matching-override';
import { wholeMonthsSince } from '@/domain/valuation-baseline';
import { isIsoDate } from '@/domain/calendar';
import { moneyInputText } from './form-values';

export function MatchingPanel({
  data,
  locale,
  busy,
  service,
  onClear,
  onSelect,
}: {
  data: DealerWorkspace;
  locale: Locale;
  busy: boolean;
  service: string;
  onClear: () => void;
  onSelect: (selection: MatchingSelection, candidate: MatchCandidate) => void;
}) {
  const t = getT(locale);
  const [correcting, setCorrecting] = useState(false);
  const [firstUsedOn, setFirstUsedOn] = useState(data.valuationBaseline?.firstUsedOn ?? '');
  const [correctionPrice, setCorrectionPrice] = useState(
    data.valuationBaseline ? moneyInputText(data.valuationBaseline.originalPriceCents) : ''
  );
  const [baselineReason, setBaselineReason] = useState('');
  const [readyOn, setReadyOn] = useState(data.businessDate);
  const [pending, setPending] = useState(false);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; result: MatchingPreview } | null>(null);
  const baselineDate = correcting ? firstUsedOn : (data.valuationBaseline?.firstUsedOn ?? '');
  const original = correcting
    ? correctionPrice
    : data.valuationBaseline
      ? moneyInputText(data.valuationBaseline.originalPriceCents)
      : '';
  const age =
    isIsoDate(baselineDate) && isIsoDate(readyOn) && baselineDate <= readyOn
      ? wholeMonthsSince(baselineDate, readyOn)
      : null;
  const money = parseCents(original);
  const input = matchingPreviewInputSchema.safeParse({
    ageMonths: age,
    originalPriceCents: money.ok ? money.cents : null,
    readyOn,
    useAutomaticBaseline: true,
    ...(correcting
      ? {
          baselineCorrection: {
            firstUsedOn,
            originalPriceCents: money.ok ? money.cents : null,
            reason: baselineReason,
          },
        }
      : {}),
    ...(service === '' ? {} : { lastServiceUsage: Number(service) }),
  });
  const key = JSON.stringify({
    age,
    original,
    readyOn,
    service,
    role: 'operator',
    date: data.businessDate,
    asset: data.asset,
    revision: data.releaseRevision,
    correcting,
    firstUsedOn,
    baselineReason,
    baseline: data.valuationBaseline,
  });
  const result = loaded?.key === key ? loaded.result : null;
  const recommendation = result?.recommendation;
  const valid = input.success && readyOn >= data.businessDate;
  const moneyText = (cents: number | null) =>
    cents === null ? t('match.unknown') : formatEuro(cents, intlLocale[locale]);
  async function preview() {
    if (!input.success || !valid) return;
    onClear();
    setLoaded(null);
    setPending(true);
    setFailedKey(null);
    try {
      const result = await requestJson(
        'assets/' + encodeURIComponent(data.asset.id) + '/matches',
        { customerId: '', businessDate: data.businessDate, role: 'operator' },
        matchingPreviewSchema,
        input.data,
        true
      );
      setLoaded({ key, result });
    } catch {
      setFailedKey(key);
    } finally {
      setPending(false);
    }
  }
  function changed() {
    onClear();
  }
  return (
    <div className="space-y-4 rounded-xl border border-emerald-300 p-4">
      <h3 className="text-lg font-semibold">{t('match.title')}</h3>
      <p className="text-sm">{t('match.assumptions')}</p>
      <p className="text-sm">
        {data.valuationBaseline
          ? messageFor(locale, 'match.baseline.' + data.valuationBaseline.source)
          : t('match.baselineMissing')}
      </p>
      {data.valuationBaseline?.reason ? (
        <p className="text-sm">
          {t('match.baselineSavedReason', { reason: data.valuationBaseline.reason })}
        </p>
      ) : null}
      <p className="text-sm">{t('wait.importedHelp')}</p>
      <fieldset disabled={busy || pending} className="grid gap-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 sm:col-span-3">
          <input
            type="checkbox"
            checked={correcting}
            onChange={(event) => {
              setCorrecting(event.target.checked);
              changed();
            }}
          />
          {t('match.correctBaseline')}
        </label>
        <Field id="match-first-used" label={t('match.firstUsedOn')}>
          <input
            id="match-first-used"
            className={inputClass}
            type="date"
            value={baselineDate}
            max={readyOn}
            disabled={!correcting}
            onChange={(event) => {
              setFirstUsedOn(event.target.value);
              changed();
            }}
          />
        </Field>
        <Field id="match-age" label={t('match.age')}>
          <input
            id="match-age"
            className={inputClass}
            type="number"
            min={0}
            max={12000}
            step={1}
            value={age ?? ''}
            readOnly
          />
        </Field>
        <Field id="match-original" label={t('match.originalPrice')}>
          <input
            id="match-original"
            className={inputClass}
            inputMode="decimal"
            value={original}
            disabled={!correcting}
            onChange={(event) => {
              setCorrectionPrice(event.target.value);
              changed();
            }}
          />
        </Field>
        <Field id="match-ready" label={t('match.readyOn')}>
          <input
            id="match-ready"
            className={inputClass}
            type="date"
            min={data.businessDate}
            value={readyOn}
            onChange={(event) => {
              setReadyOn(event.target.value);
              changed();
            }}
          />
        </Field>
        {correcting ? (
          <div className="sm:col-span-3">
            <Field id="match-baseline-reason" label={t('match.baselineReason')}>
              <p className="text-sm">{t('match.baselineCorrectionHelp')}</p>
              <textarea
                id="match-baseline-reason"
                className={inputClass}
                minLength={10}
                maxLength={500}
                value={baselineReason}
                onChange={(event) => {
                  setBaselineReason(event.target.value);
                  changed();
                }}
              />
            </Field>
          </div>
        ) : null}
        <div className="sm:col-span-3">
          <button
            type="button"
            className={`${buttonClass} inline-flex min-h-11 max-w-full items-center justify-center transition-colors enabled:hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed`}
            disabled={!valid}
            onClick={() => void preview()}
          >
            {pending ? t('spine.pending') : t('match.preview')}
          </button>
        </div>
      </fieldset>
      <div aria-live="polite">
        {failedKey === key ? <p role="alert">{t('match.error')}</p> : null}
        {result ? (
          <>
            <p className="text-sm">{t('match.policy')}</p>
            {recommendation ? (
              <>
                <h4 className="mt-4 font-semibold">
                  {t('match.recommendation', {
                    request: recommendation.customerName ?? recommendation.requestId,
                  })}
                </h4>
                <p className="text-sm break-all">
                  {t('wait.requestRef', { id: recommendation.requestId })}
                </p>
                <p>
                  {messageFor(locale, 'condition.' + recommendation.condition)} ·{' '}
                  {t('spine.months', { count: recommendation.termMonths })} ·{' '}
                  {t('spine.monthlyNet')}: {moneyText(recommendation.monthlyNetCents)}
                </p>
                <fieldset disabled={busy || pending} className="mt-4 space-y-3">
                  <p className="text-sm">
                    {t('match.estimateExplanation', {
                      cost: moneyText(recommendation.workNetCents),
                    })}
                  </p>
                  <p className="text-sm">
                    {t(
                      !recommendation.customerId
                        ? 'match.anonymousPreview'
                        : recommendation.imported
                          ? 'match.importedLink'
                          : 'wait.autoLinked'
                    )}
                  </p>
                  <p className="text-sm">{t('match.readinessHelp')}</p>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={
                      !input.success || !recommendation.customerId || readyOn !== data.businessDate
                    }
                    onClick={() => {
                      if (input.success && recommendation.customerId)
                        onSelect(
                          {
                            ...input.data,
                            waitingRequestId: recommendation.requestId,
                            waitingRevision: recommendation.waitingRevision ?? undefined,
                            nextCustomerId: recommendation.customerId,
                          },
                          recommendation
                        );
                    }}
                  >
                    {t('match.use')}
                  </button>
                </fieldset>
              </>
            ) : (
              <p className="mt-4 font-medium">{t('match.noMatch')}</p>
            )}
            {input.success ? (
              <MatchingOverride
                key={key}
                preview={result}
                input={input.data}
                locale={locale}
                disabled={busy || pending}
                readyToday={readyOn === data.businessDate}
                onClear={onClear}
                onSelect={onSelect}
              />
            ) : null}
            <details className="mt-4">
              <summary>{t('match.compare')}</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="mb-2 text-left">{t('match.tableHelp')}</caption>
                  <thead>
                    <tr>
                      {[
                        t('match.request'),
                        t('spine.targetCondition'),
                        t('match.repairCost'),
                        t('spine.newPrice'),
                        t('match.recovery'),
                        t('spine.monthlyNet'),
                        t('match.budget'),
                        t('match.deadline'),
                        t('match.result'),
                      ].map((label) => (
                        <th key={label} scope="col" className="p-2">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.candidates
                      .filter((row) => !row.reasons.includes('category'))
                      .map((row) => (
                        <tr key={row.requestId + ':' + row.condition}>
                          <th scope="row" className="border-t p-2">
                            {row.customerName ?? t('wait.anonymous')} ·{' '}
                            {t('spine.months', { count: row.termMonths })}
                            <span className="block text-xs font-normal break-all">
                              {t('wait.requestRef', { id: row.requestId })}
                            </span>
                          </th>
                          <td className="border-t p-2">
                            {messageFor(locale, 'condition.' + row.condition)}
                          </td>
                          <td className="border-t p-2">{moneyText(row.workNetCents)}</td>
                          <td className="border-t p-2">{moneyText(row.netPriceCents)}</td>
                          <td className="border-t p-2">{moneyText(row.netRecoveryCents)}</td>
                          <td className="border-t p-2">{moneyText(row.monthlyNetCents)}</td>
                          <td className="border-t p-2">{moneyText(row.budgetNetCents)}</td>
                          <td className="border-t p-2">{row.neededBy}</td>
                          <td className="border-t p-2">
                            {row.reasons.length
                              ? row.reasons
                                  .map((reason) => messageFor(locale, 'spine.reason.' + reason))
                                  .join(' · ')
                              : t('match.feasible')}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : null}
      </div>
    </div>
  );
}
