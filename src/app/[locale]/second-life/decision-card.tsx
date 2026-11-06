// One returned asset on the desk, with the WHOLE reasoning of its second-life decision:
// mandatory work, the upgrade call and why, the new price, and every waiter's verdict.
import Link from 'next/link';
import { formatEuro } from '@/domain/money';
import { ageInMonths } from '@/domain/residual';
import type { WaiterVerdict } from '@/domain/second-life';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { SecondLifePreview } from '@/server/second-life';
import { ExecuteButton } from './execute-button';

const ACTION_STYLE = {
  lease_to_waiter: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  list_available: 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
  parts_bin: 'bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100',
} as const;

export function DecisionCard({
  locale,
  preview,
  personaId,
  asOfParam,
}: {
  locale: Locale;
  preview: SecondLifePreview;
  personaId: string | null;
  asOfParam: string | null;
}) {
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const condition = (c: string) => t(`condition.${c}` as MessageKey);
  const { asset, decision, winner, winnerQuote, waiters } = preview;
  const usage = t(`usage.${asset.usage.unit}` as MessageKey, {
    value: formatNumber(asset.usage.value, locale),
  });
  const suffix = asOfParam ? `?asOf=${asOfParam}` : '';

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-stone-500 dark:text-stone-400">{asset.id}</p>
          <h2 className="text-lg font-semibold">
            {asset.make} {asset.model}
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {condition(asset.condition)} · {usage} ·{' '}
            {t('secondLife.age', { months: ageInMonths(asset.model_year, preview.asOf) })} ·{' '}
            {t('secondLife.previousLives', { count: asset.previous_lives })}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${ACTION_STYLE[decision.action]}`}
        >
          {t(`secondLife.action.${decision.action}`)}
        </span>
      </header>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section>
          <h3 className="text-sm font-semibold">{t('secondLife.refurbTitle')}</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {decision.requiredItems.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span>{t(`secondLife.item.${item.id}` as MessageKey)}</span>
                <span className="tabular-nums">{euro(item.costCents)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t border-stone-200 pt-1 font-medium dark:border-stone-700">
              <span>{t('secondLife.refurbTotal')}</span>
              <span className="tabular-nums">{euro(decision.requiredTotalCents)}</span>
            </li>
          </ul>
          {decision.usageAfterRefurb !== asset.usage.value && (
            <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">
              {t('secondLife.usageReset', { usage })}
            </p>
          )}

          <h3 className="mt-4 text-sm font-semibold">{t('secondLife.upgradeTitle')}</h3>
          <p className="mt-1 text-sm">
            {decision.upgrade === null
              ? t('secondLife.upgrade.none')
              : t(
                  decision.action === 'lease_to_waiter'
                    ? 'secondLife.upgrade.forWaiter'
                    : 'secondLife.upgrade.forListing',
                  {
                    from: condition(decision.upgrade.from),
                    to: condition(decision.upgrade.to),
                    cost: euro(decision.upgrade.costCents),
                    gain: euro(decision.valueFinalCents - decision.valueAsIsCents),
                  }
                )}
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold">{t('secondLife.priceTitle')}</h3>
          <dl className="mt-2 space-y-1 text-sm">
            <Row label={t('secondLife.v1Price')} value={euro(preview.originalListPriceCents)} />
            <Row label={t('secondLife.valueAsIs')} value={euro(decision.valueAsIsCents)} />
            <Row label={t('secondLife.valueFinal')} value={euro(decision.valueFinalCents)} />
            <Row label={t('secondLife.financed')} value={euro(decision.financedCents)} strong />
          </dl>
        </section>
      </div>

      <section className="mt-5">
        <h3 className="text-sm font-semibold">{t('secondLife.winnerTitle')}</h3>
        <p className="mt-1 text-sm">
          {winner && winnerQuote
            ? t('secondLife.winner', {
                id: winner.id,
                who: winner.who,
                joined: formatIsoDate(winner.joined_on, locale),
                rent: euro(winnerQuote.monthlyNetRentCents),
                term: winnerQuote.termMonths,
              })
            : decision.action === 'lease_to_waiter'
              ? null
              : t(`secondLife.reason.${decision.action}`)}
        </p>
      </section>

      {decision.action !== 'parts_bin' && (
        <section className="mt-5">
          <h3 className="text-sm font-semibold">{t('secondLife.matchTitle')}</h3>
          {decision.considered.length === 0 ? (
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              {t('secondLife.nobodyConsidered')}
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-stone-500 dark:text-stone-400">
                  <tr>
                    <th className="py-1 pr-3 font-medium">{t('secondLife.col.waiter')}</th>
                    <th className="py-1 pr-3 font-medium">{t('secondLife.col.joined')}</th>
                    <th className="py-1 pr-3 font-medium">{t('secondLife.col.needs')}</th>
                    <th className="py-1 pr-3 font-medium">{t('secondLife.col.rent')}</th>
                    <th className="py-1 font-medium">{t('secondLife.col.verdict')}</th>
                  </tr>
                </thead>
                <tbody>
                  {decision.considered.map((verdict) => (
                    <VerdictRow
                      key={verdict.id}
                      locale={locale}
                      verdict={verdict}
                      waiter={waiters[verdict.id]}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/${locale}/assets/${asset.id}/passport${suffix}`}
          className="text-sm text-emerald-800 hover:underline dark:text-emerald-300"
        >
          {t('secondLife.passportLink')} →
        </Link>
        <ExecuteButton
          locale={locale}
          assetId={asset.id}
          personaId={personaId}
          asOfParam={asOfParam}
        />
      </footer>
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'font-semibold' : ''}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function VerdictRow({
  locale,
  verdict,
  waiter,
}: {
  locale: Locale;
  verdict: WaiterVerdict;
  waiter: SecondLifePreview['waiters'][string] | undefined;
}) {
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const minCondition = waiter ? t(`condition.${waiter.min_condition}` as MessageKey) : '';
  const won = verdict.outcome === 'matched';
  return (
    <tr
      className={`border-t border-stone-100 align-top dark:border-stone-800 ${won ? 'font-medium' : ''}`}
    >
      <td className="py-1 pr-3">
        {verdict.id}
        {waiter && (
          <span className="block text-xs font-normal text-stone-500 dark:text-stone-400">
            {waiter.who}
          </span>
        )}
      </td>
      <td className="py-1 pr-3 whitespace-nowrap">{formatIsoDate(verdict.joinedOn, locale)}</td>
      <td className="py-1 pr-3">
        {waiter &&
          t('secondLife.needs', {
            condition: minCondition,
            term: waiter.preferred_term_months,
            date: formatIsoDate(waiter.needed_by, locale),
          })}
      </td>
      <td className="py-1 pr-3 whitespace-nowrap tabular-nums">
        {verdict.monthlyNetRentCents !== undefined ? euro(verdict.monthlyNetRentCents) : '–'}
        {waiter && ` / ${euro(waiter.max_monthly_net_rent_cents)}`}
      </td>
      <td className={`py-1 ${won ? 'text-emerald-800 dark:text-emerald-300' : ''}`}>
        {t(`secondLife.verdict.${verdict.outcome}`, { condition: minCondition })}
      </td>
    </tr>
  );
}
