import { useState } from 'react';
import type { MatchingSelection } from '@/data/second-life-schemas';
import type { AssetCondition } from '@/data/schemas';
import { refurbishmentPlan } from '@/domain/lifecycle';
import { parseCents } from '@/domain/money-arithmetic';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { DealerWorkspace } from '@/server/spine-dealer';
import { buttonClass, Field, inputClass, messageFor, panelClass } from './ui';
import { MatchingPanel } from './matching-panel';
import { moneyInputText } from './form-values';

export type RelistForm = {
  matching?: MatchingSelection;
  netPriceCents: number;
  valuationReason: string;
  condition: AssetCondition;
  completedTaskIds: string[];
  lastServiceUsage?: number;
  releaseRevision: number;
};

export function RelistPanel({
  data,
  locale,
  busy,
  onRelist,
}: {
  data: DealerWorkspace;
  locale: Locale;
  busy: boolean;
  onRelist: (input: RelistForm) => void;
}) {
  const t = getT(locale);
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [condition, setCondition] = useState<AssetCondition>('good');
  const [service, setService] = useState('');
  const [completed, setCompleted] = useState<string[]>([]);
  const [matching, setMatching] = useState<MatchingSelection | null>(null);
  function clearMatch() {
    setMatching(null);
    setCondition('good');
    setPrice('');
    setReason('');
    setCompleted([]);
  }
  const lastServiceUsage = service === '' ? undefined : Number(service);
  const plan = refurbishmentPlan({
    asset: data.asset,
    targetCondition: condition,
    costs: data.refurbishmentCosts,
    lastServiceUsage,
    maintenance: data.maintenance,
    acceptsFairCondition: matching !== null,
  });
  const money = parseCents(price);
  return (
    <section className={panelClass} aria-labelledby="relist-heading">
      <h2 id="relist-heading" className="text-xl font-semibold">
        {t('spine.relist')}
      </h2>
      <p className="mt-3 font-medium">{t('spine.operator')}</p>
      <p className="mt-2 text-sm">{t('spine.operatorHelp')}</p>
      <MatchingPanel
        data={data}
        locale={locale}
        busy={busy}
        service={service}
        onClear={clearMatch}
        onSelect={(selection, candidate) => {
          if (candidate.netPriceCents === null) return;
          setMatching(selection);
          setCondition(candidate.condition);
          setPrice(moneyInputText(candidate.netPriceCents));
          setReason(
            t('match.valuationReason', { request: candidate.requestId, age: selection.ageMonths })
          );
          setCompleted([]);
        }}
      />
      {matching ? (
        <p role="status" className="mt-4">
          {t('match.selected', { request: matching.waitingRequestId })}{' '}
          <button type="button" className="underline" disabled={busy} onClick={clearMatch}>
            {t('match.clear')}
          </button>
        </p>
      ) : null}
      {matching?.overrideReason ? (
        <p className="mt-2 text-sm">
          {t('match.savedOverride', { reason: matching.overrideReason })}
        </p>
      ) : null}
      <fieldset disabled={busy} className="mt-5 space-y-4">
        <Field id="relist-price" label={t('spine.newPrice')}>
          <input
            id="relist-price"
            disabled={matching !== null}
            className={inputClass}
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </Field>
        <Field id="relist-reason" label={t('spine.valuationReason')}>
          <textarea
            id="relist-reason"
            className={inputClass}
            minLength={10}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <Field id="relist-condition" label={t('spine.targetCondition')}>
          <select
            id="relist-condition"
            disabled={matching !== null}
            className={inputClass}
            value={condition}
            onChange={(event) => {
              setCondition(event.target.value as AssetCondition);
              setCompleted([]);
            }}
          >
            {(matching ? [condition] : ['good', 'like_new']).map((value) => (
              <option key={value} value={value}>
                {messageFor(locale, 'condition.' + value)}
              </option>
            ))}
          </select>
        </Field>
        {data.asset.category === 'farm_machine' ? (
          <Field id="service-reading" label={t('spine.lastService')}>
            <input
              id="service-reading"
              type="number"
              min={0}
              max={data.asset.usage.value}
              step={1}
              className={inputClass}
              value={service}
              onChange={(event) => {
                clearMatch();
                setService(event.target.value);
                setCompleted([]);
              }}
            />
          </Field>
        ) : null}
        {plan.ok ? (
          <div>
            <p className="font-medium">{t('spine.workDone')}</p>
            {plan.tasks.map((task) => (
              <label key={task.id} className="mt-2 flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={completed.includes(task.id)}
                  onChange={(event) =>
                    setCompleted(
                      event.target.checked
                        ? [...completed, task.id]
                        : completed.filter((id) => id !== task.id)
                    )
                  }
                />
                <span>
                  {messageFor(locale, 'spine.task.' + task.id)} ·{' '}
                  {formatEuro(task.netCostCents, intlLocale[locale])}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p role="status">{messageFor(locale, 'spine.reason.' + plan.reason)}</p>
        )}
        <button
          className={buttonClass}
          disabled={
            !money.ok ||
            reason.trim().length < 10 ||
            !plan.ok ||
            (plan.ok && plan.tasks.some((task) => !completed.includes(task.id)))
          }
          onClick={() => {
            if (money.ok)
              onRelist({
                ...(matching ? { matching } : {}),
                netPriceCents: money.cents,
                valuationReason: reason,
                condition,
                completedTaskIds: completed,
                releaseRevision: data.releaseRevision,
                ...(lastServiceUsage === undefined ? {} : { lastServiceUsage }),
              });
          }}
        >
          {t('spine.publish')}
        </button>
      </fieldset>
    </section>
  );
}
