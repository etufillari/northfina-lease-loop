'use client';

// Displays the Second-Life valuation, waiting-list matchmaking (winner + excluded candidates),
// asset passport across lives, circular CO2 impact, and the "Relist for next life" action
// inside the catalogue drawer for returned or multi-life items (Spine step 7, Cards 9 & 10).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AssetStatus } from '@/data/schemas';
import type { ExcludedWaitingListCandidate, SecondLifeValuation } from '@/domain/end-of-term';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, messages, type MessageKey, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { AssetEventSummary } from '@/server/assets';

export type SecondLifeData = {
  valuation: SecondLifeValuation;
  events: AssetEventSummary[];
};

function exclusionText(
  candidate: ExcludedWaitingListCandidate,
  t: Translate,
  locale: Locale
): string {
  const intlTag = intlLocale[locale];
  switch (candidate.reason) {
    case 'condition_too_low':
      return t('secondLife.excludedReason.condition_too_low', {
        condition: t(`condition.${candidate.request.min_condition}`),
      });
    case 'deadline_passed':
      return t('secondLife.excludedReason.deadline_passed', {
        date: formatIsoDate(candidate.request.needed_by, locale),
      });
    case 'over_budget':
      return t('secondLife.excludedReason.over_budget', {
        budget: formatEuro(candidate.request.max_monthly_net_rent_cents, intlTag),
      });
    case 'not_financeable':
    default:
      return t('secondLife.excludedReason.not_financeable');
  }
}

export function SecondLifePanel({
  assetId,
  status,
  previousLives,
  secondLife,
  locale,
  isoDate,
  onRelisted,
}: {
  assetId: string;
  status: AssetStatus;
  previousLives: number;
  secondLife: SecondLifeData;
  locale: Locale;
  isoDate: string;
  onRelisted: (relistPriceCents: number, preferredTermMonths?: number) => void;
}) {
  const router = useRouter();
  const t = getT(locale);
  const intlTag = intlLocale[locale];
  const { valuation, events } = secondLife;
  const topMatch = valuation.matches[0];

  const [isRelisting, setIsRelisting] = useState(false);
  const [relistedNow, setRelistedNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = (cents: number) => formatEuro(cents, intlTag);
  const recordedCompletedLives = events.filter(
    (e) => e.toStatus === 'returned' || e.toStatus === 'sold'
  ).length;
  const activeLeaseCount = events.at(-1)?.toStatus === 'leased' ? 1 : 0;
  const unrecordedSeededLives = Math.max(0, previousLives - recordedCompletedLives);
  const totalPassportLives = previousLives + activeLeaseCount;
  const seededLives = Array.from({ length: unrecordedSeededLives }, (_, i) => i + 1);

  async function handleRelist() {
    if (isRelisting) return;
    setIsRelisting(true);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}/relist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'customer', asOf: isoDate }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          relistPriceCents: number;
          topMatch?: { request: { preferred_term_months: number } } | null;
        };
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error('relist failed');
      }
      setRelistedNow(true);
      onRelisted(json.data.relistPriceCents, json.data.topMatch?.request.preferred_term_months);
      router.refresh();
    } catch {
      setError(t('invoices.earlyExit.action.error'));
    } finally {
      setIsRelisting(false);
    }
  }

  return (
    <div className="my-[16px] space-y-[16px] rounded-[8px] border border-[#cde5d5] bg-[#f7f8f7] p-[16px] text-[#353331] dark:border-emerald-800/70 dark:bg-emerald-950/20 dark:text-stone-100">
      <div className="flex flex-wrap items-center justify-between gap-[8px]">
        <h3 className="text-[1rem] font-bold text-[#14522a] dark:text-emerald-200">
          {t('secondLife.heading')}
        </h3>
        <span className="rounded-full bg-[#eaf0ec] px-[8px] py-[2px] text-[0.75rem] font-bold text-[#16A34A] dark:bg-emerald-900/60 dark:text-emerald-300">
          +{t('secondLife.avoidedCo2Value', { co2: valuation.avoidedCo2Kg })}
        </span>
      </div>

      {/* Valuation & circular impact metrics */}
      <dl className="grid grid-cols-1 gap-x-[16px] gap-y-[8px] text-[0.875rem] sm:grid-cols-2">
        <div className="flex justify-between gap-[8px] border-b border-[#cde5d5] pb-[4px] dark:border-emerald-900/50">
          <dt className="text-[#615b57] dark:text-stone-400">{t('secondLife.relistPrice')}</dt>
          <dd className="font-mono font-bold text-[#14522a] tabular-nums dark:text-emerald-300">
            {money(valuation.relistPriceCents)}
          </dd>
        </div>
        <div className="flex justify-between gap-[8px] border-b border-[#cde5d5] pb-[4px] dark:border-emerald-900/50">
          <dt className="text-[#615b57] dark:text-stone-400">
            {t('secondLife.firstListPrice', {
              date: formatIsoDate(valuation.firstLeaseDate, locale),
            })}
          </dt>
          <dd className="font-mono font-semibold tabular-nums">
            {money(valuation.firstListPriceCents)}
          </dd>
        </div>
        <div className="flex justify-between gap-[8px] border-b border-[#cde5d5] pb-[4px] dark:border-emerald-900/50">
          <dt className="text-[#615b57] dark:text-stone-400">
            {t('secondLife.ageAndCurve', {
              months: valuation.ageMonths,
              percent: Math.round(valuation.curvePercent * 10) / 10,
            })}
          </dt>
          <dd className="font-mono font-semibold text-[#16A34A] tabular-nums dark:text-emerald-300">
            -{money(valuation.customerSavingsCents)} ({t('secondLife.customerSavings')})
          </dd>
        </div>
        <div className="flex justify-between gap-[8px] border-b border-[#cde5d5] pb-[4px] dark:border-emerald-900/50">
          <dt className="text-[#615b57] dark:text-stone-400">{t('secondLife.avoidedCo2')}</dt>
          <dd className="font-mono font-bold text-[#16A34A] tabular-nums dark:text-emerald-300">
            {t('secondLife.avoidedCo2Value', { co2: valuation.avoidedCo2Kg })}
          </dd>
        </div>
      </dl>

      {/* Waiting-list matchmaking */}
      <div className="rounded-[8px] border border-[#dad9d8] bg-[#FFFFFF] p-[12px] text-[0.875rem] dark:border-stone-800 dark:bg-stone-900">
        <p className="text-[0.75rem] font-bold tracking-wider text-[#1354a5] uppercase dark:text-sky-400">
          {t('secondLife.matchmakingHeading')}
        </p>
        {topMatch ? (
          <div className="mt-[4px]">
            <p className="font-bold text-[#14522a] dark:text-emerald-300">
              {t('secondLife.topMatch', {
                id: topMatch.request.id,
                who: topMatch.request.who,
              })}
            </p>
            <p className="font-mono text-[0.75rem] text-[#615b57] dark:text-stone-400">
              {t('secondLife.topMatchRent', {
                rent: money(topMatch.monthlyNetRentCents),
                months: topMatch.request.preferred_term_months,
                date: formatIsoDate(topMatch.request.needed_by, locale),
              })}
            </p>
          </div>
        ) : (
          <p className="mt-[4px] text-[#615b57] dark:text-stone-400">{t('secondLife.noMatches')}</p>
        )}

        {valuation.excluded.length > 0 ? (
          <div className="mt-[8px] border-t border-[#ededed] pt-[8px] text-[0.75rem] dark:border-stone-800">
            <p className="font-semibold text-[#615b57] dark:text-stone-400">
              {t('secondLife.excludedHeading')}:
            </p>
            <ul className="mt-[4px] space-y-[2px] text-[#615b57] dark:text-stone-400">
              {valuation.excluded.map((cand) => (
                <li key={cand.request.id} className="flex flex-wrap justify-between gap-[8px]">
                  <span>
                    <span className="font-mono font-semibold">{cand.request.id}</span> ·{' '}
                    {cand.request.who}
                  </span>
                  <span className="text-[#b76200] dark:text-amber-300">
                    {exclusionText(cand, t, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Asset passport */}
      <div className="rounded-[8px] border border-[#dad9d8] bg-[#FFFFFF] p-[12px] text-[0.875rem] dark:border-stone-800 dark:bg-stone-900">
        <p className="text-[0.75rem] font-bold tracking-wider text-[#1354a5] uppercase dark:text-sky-400">
          {t('secondLife.passportHeading', { lives: totalPassportLives })}
        </p>
        <ul className="mt-[6px] space-y-[4px] text-[0.75rem] text-[#615b57] dark:text-stone-400">
          {seededLives.map((life) => (
            <li key={`seeded-${life}`} className="flex items-center justify-between gap-[8px]">
              <span>{t('secondLife.passportSeededLife', { life })}</span>
              <span className="font-mono text-[#16A34A] dark:text-emerald-400">
                +{t('secondLife.avoidedCo2Value', { co2: valuation.avoidedCo2Kg })}
              </span>
            </li>
          ))}
          {events.map((ev) => {
            const labelKey = (ev.noteKey ?? 'passport.event.leased') as MessageKey;
            const label = labelKey in messages.en ? t(labelKey) : ev.toStatus;
            return (
              <li key={ev.id} className="flex items-center justify-between gap-[8px]">
                <span>
                  <span className="font-mono">{formatIsoDate(ev.onDate, locale)}</span> · {label} (
                  {t(`status.${ev.fromStatus as AssetStatus}`)} →{' '}
                  {t(`status.${ev.toStatus as AssetStatus}`)})
                </span>
                {ev.amountCents !== null ? (
                  <span className="font-mono font-semibold">{money(ev.amountCents)}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Relist action for returned items */}
      {relistedNow ? (
        <p
          role="status"
          className="rounded-[8px] border border-[#2ed167] bg-[#eaf0ec] p-[12px] text-[0.875rem] font-semibold text-[#14522a] dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
        >
          {t('secondLife.relistedNotice', { price: money(valuation.relistPriceCents) })}
        </p>
      ) : status === 'returned' ? (
        valuation.canRelist ? (
          <div>
            <button
              type="button"
              disabled={isRelisting}
              onClick={handleRelist}
              className="w-full rounded-[8px] bg-[#2ed167] px-[16px] py-[10px] text-[0.875rem] font-bold text-[#123054] transition-colors hover:bg-[#17a047] hover:text-[#FFFFFF] disabled:opacity-50 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-500"
            >
              {isRelisting
                ? t('secondLife.relistingButton')
                : t('secondLife.relistButton', { price: money(valuation.relistPriceCents) })}
            </button>
            {error ? (
              <p role="alert" className="mt-[8px] text-[0.875rem] text-[#DC2626]">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <p
            role="alert"
            className="rounded-[8px] border border-[#e9dac8] bg-[#f8f7f6] p-[12px] text-[0.875rem] text-[#5c360a] dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
          >
            {valuation.cannotRelistReason === 'below_minimum'
              ? t('secondLife.cannotRelist.below_minimum', {
                  price: money(valuation.relistPriceCents),
                })
              : t('secondLife.cannotRelist.condition_too_low')}
          </p>
        )
      ) : null}
    </div>
  );
}
