'use client';

// Spine step 6: buy, return or pass on (D-029). Runs the domain rules live in the browser so a
// mistake shows before saving; the server decides again with the same function (D-018).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import {
  assetConditionSchema,
  type AssetCondition,
  type SecondLifeRequest,
  type UsageUnit,
  type VatRates,
} from '@/data/schemas';
import {
  buyoutInvoice,
  endOfTerm,
  endOfTermDates,
  type EndedContract,
  type EndOfTermChoice,
  type EndOfTermKind,
} from '@/domain/end-of-term';
import { formatEuro } from '@/domain/money';
import { isWaitingListId, passOnMatches, passOnReadyOn } from '@/domain/pass-on';
import type { SecondLifeData, SecondLifeItem } from '@/domain/second-life';
import type { RankedMatch } from '@/domain/waiting-list';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { refusalText } from '@/i18n/refusals';

export type EndOfTermFormProps = {
  locale: Locale;
  contractId: number;
  contract: EndedContract;
  vatRates: VatRates;
  today: string;
  delivered: { condition: AssetCondition; usageValue: number; unit: UsageUnit };
  /** Personas who could lease it next (not the current customer). */
  personas: { id: string; name: string }[];
  /** What it takes to rank the waiting list for this item (D-048); null when it can't be valued. */
  passOn: { data: SecondLifeData; demand: SecondLifeRequest[]; item: SecondLifeItem } | null;
};

const KINDS: EndOfTermKind[] = ['buy', 'return', 'pass_on'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EndOfTermForm(props: EndOfTermFormProps) {
  const { locale, contract, delivered } = props;
  const t = getT(locale);
  const router = useRouter();
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const date = (iso: string) => formatIsoDate(iso, locale);
  const ids = { condition: useId(), usage: useId(), lessee: useId(), email: useId() };

  const [kind, setKind] = useState<EndOfTermKind>('buy');
  const [condition, setCondition] = useState<AssetCondition>(delivered.condition);
  const [usage, setUsage] = useState(String(delivered.usageValue));
  const dates = endOfTermDates(contract);
  const readyOn = passOnReadyOn(props.today, dates.handoverDate);
  // The waiting list as the item will be on the day it's ready, re-ranked as the inspection changes.
  const rank = (inspected: AssetCondition, usageValue: number | null) =>
    props.passOn && usageValue !== null
      ? passOnMatches(
          props.passOn.data,
          props.passOn.demand,
          props.passOn.item,
          { condition: inspected, usageValue },
          readyOn
        )
      : [];
  const [lessee, setLessee] = useState(
    () =>
      rank(delivered.condition, delivered.usageValue)[0]?.requestId ?? props.personas[0]?.id ?? ''
  );
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState<'idle' | 'busy' | 'error'>('idle');
  // The code the server refused with picks the message (D-038).
  const [refusal, setRefusal] = useState<string | undefined>(undefined);

  const preview = buyoutInvoice(contract, props.vatRates, dates.handoverDate);
  const usageValue = /^\d+$/.test(usage) ? Number(usage) : null;
  const ranked = rank(condition, usageValue);
  const requests = new Map(props.passOn?.demand.map((r) => [r.id, r]));
  const pickedMatch = ranked.find((m) => m.requestId === lessee);
  // A waiting-list pick that no longer fits the item as now described can't be saved.
  const staleMatch = kind === 'pass_on' && isWaitingListId(lessee) && !pickedMatch;
  const nextLessee = lessee === 'email' ? email.trim() : lessee;
  const choice: EndOfTermChoice | null =
    kind === 'buy'
      ? { kind }
      : usageValue === null
        ? null
        : kind === 'return'
          ? { kind, condition, usageValue }
          : { kind, condition, usageValue, nextLessee };
  const decided = choice
    ? endOfTerm(contract, props.vatRates, delivered, choice, props.today)
    : null;
  const emailInvalid = kind === 'pass_on' && lessee === 'email' && !EMAIL.test(nextLessee);
  const problem = decided && !decided.ok ? decided : null;
  const canSave = decided?.ok === true && !emailInvalid && !staleMatch && saving !== 'busy';

  async function save() {
    if (!choice) return;
    setSaving('busy');
    const response = await fetch(`/api/contracts/${props.contractId}/end`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(choice),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      success: boolean;
      error?: { code: string };
    } | null;
    if (body?.success) {
      router.refresh();
      return;
    }
    setRefusal(body?.error?.code);
    setSaving('error');
  }

  if (props.today < dates.opensOn) {
    // Until the choice opens, the key dates in order, so the card shows what lies ahead.
    const keyDates = [
      ['end.key.opensOn', dates.opensOn],
      ['end.key.lastDay', dates.lastDay],
      ['end.key.handover', dates.handoverDate],
    ] as const;
    return (
      <div>
        <ol className="border-l border-line">
          {keyDates.map(([key, iso], i) => (
            <li key={key} className="relative pb-5 pl-6 last:pb-0">
              <span
                aria-hidden="true"
                className={`absolute top-1.5 -left-[5px] size-2.5 rounded-full ring-4 ring-surface ${i === 0 ? 'bg-accent' : 'bg-line'}`}
              />
              <p className="eyebrow">{t(key)}</p>
              <p className="mt-0.5 font-semibold tabular-nums">{date(iso)}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-sm text-muted">{t('end.notYet', { date: date(dates.opensOn) })}</p>
      </div>
    );
  }

  return (
    <div>
      <fieldset>
        <legend className="eyebrow">{t('end.choose')}</legend>
        <div className="mt-3 space-y-3">
          {KINDS.map((k) => (
            <label key={k} className="choice-card">
              <input
                type="radio"
                name="end-kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="mt-1"
              />
              <span>
                <span className="font-semibold">{t(`end.kind.${k}`)}</span>
                <span className="mt-0.5 block text-sm text-muted">
                  {k === 'buy' && preview
                    ? t('end.text.buy', {
                        net: euro(preview.netCents),
                        rate: formatNumber(preview.vatRatePercent, locale),
                        gross: euro(preview.grossCents),
                      })
                    : t(`end.text.${k}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind === 'buy' ? null : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
              {t('end.usage', { unit: t(`unit.${delivered.unit}`) })}
            </label>
            <input
              id={ids.usage}
              inputMode="numeric"
              value={usage}
              onChange={(e) => setUsage(e.target.value.replace(/\s/g, ''))}
              className="field mt-2"
              aria-describedby={`${ids.usage}-hint`}
            />
            <p id={`${ids.usage}-hint`} className="mt-1 text-xs text-muted">
              {t('end.usageHint', { value: formatNumber(delivered.usageValue, locale) })}
            </p>
          </div>
        </div>
      )}

      {kind === 'pass_on' ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.lessee} className="eyebrow">
              {t('end.nextLessee')}
            </label>
            <select
              id={ids.lessee}
              value={lessee}
              onChange={(e) => setLessee(e.target.value)}
              className="field mt-2"
            >
              {staleMatch ? (
                <option value={lessee} disabled>
                  {requests.get(lessee)?.who ?? lessee}
                </option>
              ) : null}
              {ranked.length > 0 ? (
                <optgroup label={t('end.group.waitingList')}>
                  {ranked.map((m) => (
                    <option key={m.requestId} value={m.requestId}>
                      {t('end.waitingOption', {
                        who: requests.get(m.requestId)?.who ?? m.requestId,
                        rent: euro(m.monthlyRentCents),
                        term: m.termMonths,
                      })}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label={t('end.group.people')}>
                {props.personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="email">{t('end.someoneElse')}</option>
              </optgroup>
            </select>
            {ranked.length === 0 && props.passOn ? (
              <p className="mt-1 text-xs text-muted">
                {t('end.noWaitingMatch', { date: date(readyOn) })}
              </p>
            ) : null}
          </div>
          {pickedMatch ? (
            <WaitingFit
              locale={locale}
              match={pickedMatch}
              request={requests.get(pickedMatch.requestId)}
              readyOn={readyOn}
            />
          ) : null}
          {lessee === 'email' ? (
            <div>
              <label htmlFor={ids.email} className="eyebrow">
                {t('end.email')}
              </label>
              <input
                id={ids.email}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field mt-2"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {staleMatch ? (
        <p role="alert" className="mt-4 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          {t('end.waitingStale')}
        </p>
      ) : null}

      {problem || (emailInvalid && email !== '') ? (
        <p role="alert" className="mt-4 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          {problem
            ? t(`end.reason.${problem.reason}`, {
                condition: t(`condition.${delivered.condition}`),
                date: date(dates.opensOn),
              })
            : t('end.reason.invalid_email')}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={!canSave}
        className="btn-primary mt-6 w-full py-3.5 sm:w-auto sm:px-8"
      >
        {saving === 'busy' ? t('end.saving') : t('end.confirm')}
      </button>
      {saving === 'error' ? (
        <p role="alert" className="mt-2 text-sm text-warn-fg">
          {refusalText(t, refusal, 'end.error')}
        </p>
      ) : null}
    </div>
  );
}

/** Why the chosen waiting-list person fits: their needs beside what the item will cost them. */
function WaitingFit(props: {
  locale: Locale;
  match: RankedMatch;
  request: SecondLifeRequest | undefined;
  readyOn: string;
}) {
  const { locale, match, request } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm sm:col-span-2">
      <p className="font-semibold">
        {t('end.waitingRent', {
          rent: euro(match.monthlyRentCents),
          term: match.termMonths,
        })}
      </p>
      {request ? (
        <p className="mt-0.5 text-muted">
          {t('end.waitingFit', {
            condition: t(`condition.${request.min_condition}`),
            budget: euro(request.max_monthly_net_rent_cents),
            neededBy: formatIsoDate(request.needed_by, locale),
            readyOn: formatIsoDate(props.readyOn, locale),
          })}
        </p>
      ) : null}
    </div>
  );
}
