'use client';

// The three things a customer can do when a lease ends: return, buy or pass on.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Asset, AssetCondition, EndOfTermAction } from '@/data/schemas';
import { assetConditionSchema } from '@/data/schemas';
import { handoverConditionCeiling, type WaitingListOffer } from '@/domain/lifecycle/pass-on';
import { conditionRank, type MatchPricing } from '@/domain/second-life/second-life-matching';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { ContractViewPassOn } from '@/server/contracts/contract-view';
import type { EndOfTermAvailability } from '@/server/lifecycle/end-of-term';

type PassOnPreview = {
  mandatorySteps: string[];
  waitingList: WaitingListOffer[];
  named: { pricing: MatchPricing } | null;
};

type EndOfTermChoicesProps = {
  asset: Asset;
  buyoutCents: number;
  contractId: string;
  customerId: string;
  endOfTerm: EndOfTermAvailability;
  endOfTermAction: EndOfTermAction | null;
  endsOn: string;
  locale: Locale;
  passedOnTo: ContractViewPassOn | null;
  today: string;
};

const namedChoice = 'named';
const secondaryButton =
  'rounded-full border border-ink-300 px-5 py-2.5 font-medium transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ink-600 dark:hover:bg-ink-800';
const fieldClasses =
  'mt-1 w-full rounded-xl border border-ink-300 bg-white px-3 py-2.5 dark:border-ink-600 dark:bg-ink-950';

export function EndOfTermChoices(props: EndOfTermChoicesProps) {
  const { asset, buyoutCents, contractId, customerId, endOfTerm, locale, today } = props;
  const t = getT(locale);
  const router = useRouter();
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);

  const [action, setAction] = useState<EndOfTermAction | null>(null);
  const conditionCeiling = handoverConditionCeiling(asset.condition);
  const [condition, setCondition] = useState<AssetCondition>(conditionCeiling);
  const [reading, setReading] = useState(String(asset.usage.value));
  const [preview, setPreview] = useState<PassOnPreview | null>(null);
  const [recipient, setRecipient] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (props.endOfTermAction) {
    return (
      <div className="mt-5 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200 ring-inset dark:bg-sky-950 dark:text-sky-100 dark:ring-sky-800">
        <p>
          {t('contract.selectedEndAction', {
            action: t(`contract.endAction.${props.endOfTermAction}`),
          })}
        </p>
        {props.passedOnTo ? (
          <p className="mt-1">
            {t('contract.end.passOn.done', {
              who: props.passedOnTo.recipient,
              rent: euro(props.passedOnTo.monthlyNetRentCents),
              term: props.passedOnTo.termMonths,
            })}
          </p>
        ) : null}
      </div>
    );
  }

  const blocked = endOfTerm.status === 'blocked' ? endOfTerm : null;
  const usageValue = Number(reading);
  const readingIsValid =
    reading !== '' && Number.isSafeInteger(usageValue) && usageValue >= asset.usage.value;
  const conditions = assetConditionSchema.options.filter(
    (option) => conditionRank[option] <= conditionRank[conditionCeiling]
  );
  const namedIsValid = name.trim() !== '' && /^\S+@\S+\.\S+$/.test(email.trim());
  const canConfirmPassOn =
    recipient !== '' && (recipient !== namedChoice || (preview?.named && namedIsValid));

  function choose(next: EndOfTermAction) {
    setAction(next === action ? null : next);
    setError(undefined);
  }

  function clearPreview() {
    setPreview(null);
    setRecipient('');
    setError(undefined);
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as { success: boolean; data: T };
    if (!response.ok || !result.success) throw new Error('request_failed');
    return result.data;
  }

  async function findRecipients() {
    setIsBusy(true);
    setError(undefined);
    try {
      setPreview(
        await post<PassOnPreview>(`/api/contracts/${contractId}/pass-on/preview`, {
          condition,
          usageValue,
          handoverOn: today,
        })
      );
    } catch {
      setError(t('contract.end.error'));
    }
    setIsBusy(false);
  }

  async function complete(body: Record<string, unknown>) {
    setIsBusy(true);
    setError(undefined);
    try {
      await post(`/api/contracts/${contractId}/end-of-term`, {
        ...body,
        completedOn: today,
        actor: `customer:${customerId}`,
      });
      router.refresh();
    } catch {
      setError(t('contract.end.error'));
      setIsBusy(false);
    }
  }

  function confirmPassOn() {
    return complete({
      action: 'passed_on',
      condition,
      usageValue,
      recipient:
        recipient === namedChoice
          ? { type: 'named', name: name.trim(), email: email.trim() }
          : { type: 'waiting_list', requestId: recipient },
    });
  }

  const cards = [
    { id: 'returned', icon: '↩', title: t('contract.returnTitle'), body: t('contract.returnBody') },
    {
      id: 'bought',
      icon: '✓',
      title: t('contract.buyTitle'),
      body: t('contract.buyBody', { amount: euro(buyoutCents) }),
    },
    {
      id: 'passed_on',
      icon: '→',
      title: t('contract.passOnTitle'),
      body: t('contract.passOnBody'),
    },
  ] as const;

  return (
    <div className="mt-5">
      {blocked ? (
        <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
          {t(`contract.end.blocked.${blocked.reason}`, {
            date: formatIsoDate(props.endsOn, locale),
            amount: euro(blocked.outstandingRentCents),
          })}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            disabled={blocked !== null || isBusy}
            aria-pressed={action === card.id}
            onClick={() => choose(card.id)}
            className="rounded-2xl border border-ink-200 bg-white p-5 text-left shadow-sm transition enabled:hover:border-brand-300 enabled:hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:border-brand-500 aria-pressed:ring-2 aria-pressed:ring-brand-500 dark:border-ink-800 dark:bg-ink-900"
          >
            <span aria-hidden="true" className="text-2xl text-brand-700 dark:text-brand-400">
              {card.icon}
            </span>
            <span className="mt-4 block font-semibold">{card.title}</span>
            <span className="mt-2 block text-sm leading-6 text-ink-600 dark:text-ink-400">
              {card.body}
            </span>
          </button>
        ))}
      </div>

      {action ? (
        <div className="mt-4 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6 dark:border-ink-800 dark:bg-ink-900">
          {action === 'returned' ? (
            <>
              <p className="leading-7">{t('contract.end.returnSummary')}</p>
              <button
                type="button"
                className="btn-primary mt-5"
                disabled={isBusy}
                onClick={() => complete({ action: 'returned' })}
              >
                {t('contract.end.returnConfirm')}
              </button>
            </>
          ) : null}

          {action === 'bought' ? (
            <>
              <p className="leading-7">{t('contract.end.buySummary')}</p>
              <button
                type="button"
                className="btn-primary mt-5"
                disabled={isBusy}
                onClick={() => complete({ action: 'bought', buyoutPaidCents: buyoutCents })}
              >
                {t('contract.end.buyConfirm', { amount: euro(buyoutCents) })}
              </button>
            </>
          ) : null}

          {action === 'passed_on' ? (
            <>
              <h3 className="font-semibold">{t('contract.end.passOn.handoverTitle')}</h3>
              <p className="mt-1 text-sm leading-6 text-ink-600 dark:text-ink-400">
                {t('contract.end.passOn.handoverIntro')}
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  {t('contract.end.passOn.condition')}
                  <select
                    className={fieldClasses}
                    value={condition}
                    onChange={(event) => {
                      setCondition(event.target.value as AssetCondition);
                      clearPreview();
                    }}
                  >
                    {conditions.map((option) => (
                      <option key={option} value={option}>
                        {t(`condition.${option}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  {t('contract.end.passOn.reading')}
                  <input
                    className={fieldClasses}
                    type="number"
                    inputMode="numeric"
                    min={asset.usage.value}
                    value={reading}
                    aria-invalid={!readingIsValid}
                    onChange={(event) => {
                      setReading(event.target.value);
                      clearPreview();
                    }}
                  />
                  <span className="mt-1 block font-normal text-ink-600 dark:text-ink-400">
                    {t('contract.end.passOn.recorded', {
                      value: t(`usage.${asset.usage.unit}`, {
                        value: formatNumber(asset.usage.value, locale),
                      }),
                    })}
                  </span>
                </label>
              </div>

              {!preview ? (
                <button
                  type="button"
                  className={`${secondaryButton} mt-5`}
                  disabled={isBusy || !readingIsValid}
                  onClick={findRecipients}
                >
                  {t('contract.end.passOn.find')}
                </button>
              ) : (
                <fieldset className="mt-6">
                  <legend className="font-semibold">{t('contract.end.passOn.recipient')}</legend>
                  <ul className="mt-3 space-y-2">
                    {preview.waitingList.map(({ request, pricing }) => (
                      <li key={request.id}>
                        <RecipientOption
                          checked={recipient === request.id}
                          label={request.who}
                          note={priceNote(pricing)}
                          onSelect={() => setRecipient(request.id)}
                        />
                      </li>
                    ))}
                    {preview.named ? (
                      <li>
                        <RecipientOption
                          checked={recipient === namedChoice}
                          label={t('contract.end.passOn.namedOption')}
                          note={priceNote(preview.named.pricing)}
                          onSelect={() => setRecipient(namedChoice)}
                        />
                      </li>
                    ) : null}
                  </ul>
                  {preview.waitingList.length === 0 ? (
                    <p className="mt-3 text-sm text-ink-600 dark:text-ink-400">
                      {t('contract.end.passOn.noWaiting')}
                    </p>
                  ) : null}
                  {!preview.named ? (
                    <p className="mt-3 text-sm text-ink-600 dark:text-ink-400">
                      {t('contract.end.passOn.namedUnavailable')}
                    </p>
                  ) : null}

                  {recipient === namedChoice ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="text-sm font-medium">
                        {t('contract.end.passOn.name')}
                        <input
                          className={fieldClasses}
                          value={name}
                          maxLength={100}
                          autoComplete="off"
                          onChange={(event) => setName(event.target.value)}
                        />
                      </label>
                      <label className="text-sm font-medium">
                        {t('contract.end.passOn.email')}
                        <input
                          className={fieldClasses}
                          type="email"
                          value={email}
                          autoComplete="off"
                          onChange={(event) => setEmail(event.target.value)}
                        />
                      </label>
                    </div>
                  ) : null}

                  {preview.mandatorySteps.includes('certified_data_wipe') ? (
                    <p className="mt-4 text-sm leading-6">{t('contract.end.passOn.dataWipe')}</p>
                  ) : null}
                  <p className="mt-4 text-sm leading-6 text-ink-600 dark:text-ink-400">
                    {t('contract.end.passOn.contractNote')}
                  </p>
                  <button
                    type="button"
                    className="btn-primary mt-5"
                    disabled={isBusy || !canConfirmPassOn}
                    onClick={confirmPassOn}
                  >
                    {t('contract.end.passOn.confirm')}
                  </button>
                </fieldset>
              )}
            </>
          ) : null}

          {error ? (
            <p role="alert" className="mt-4 text-sm font-medium text-rose-700 dark:text-rose-300">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  function priceNote(pricing: MatchPricing) {
    return t('contract.end.passOn.price', {
      rent: euro(pricing.monthlyNetRentCents),
      term: pricing.termMonths,
      value: euro(pricing.marketValueCents),
    });
  }
}

function RecipientOption({
  checked,
  label,
  note,
  onSelect,
}: {
  checked: boolean;
  label: string;
  note: string;
  onSelect: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 p-3 transition has-checked:border-brand-600 dark:border-ink-700">
      <input
        type="radio"
        name="pass-on-recipient"
        className="mt-1 size-4 accent-brand-700"
        checked={checked}
        onChange={onSelect}
      />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="mt-0.5 block text-sm text-ink-600 dark:text-ink-400">{note}</span>
      </span>
    </label>
  );
}
