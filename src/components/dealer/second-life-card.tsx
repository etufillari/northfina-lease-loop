// Second life on the return page: either the reservation that was made, or the preview of the
// decision with the ranked requests, the reasons and the Reserve button.
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { SecondLifeSection } from '@/server/second-life-view';
import type { ActionTexts } from './use-return-action';
import { ReserveButton } from './reserve-button';

const REJECTION_REASONS = [
  'over_budget',
  'condition_below_minimum',
  'not_available_by_deadline',
  'unsupported_term',
  'missing_service_history',
  'missing_cost_rule',
] as const;

function rejectionKey(reason: string) {
  const known = REJECTION_REASONS.find((candidate) => candidate === reason);
  return known ? (`dealer.secondLife.reject.${known}` as const) : 'dealer.secondLife.reject.other';
}

type Comparison = {
  winnerRequestId: string;
  otherRequestId: string;
  decidedBy: 'deadline' | 'condition_requirement' | 'request_id';
};

type Props = {
  section: Exclude<SecondLifeSection, { kind: 'none' }>;
  assetId: string;
  usageSinceLastService?: number;
  locale: Locale;
  t: Translate;
  texts: ActionTexts;
};

const cardClass =
  'rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900';

function Reasons({
  comparisons,
  labels,
  t,
}: {
  comparisons: Comparison[];
  labels: Map<string, string>;
  t: Translate;
}) {
  if (comparisons.length === 0) return null;
  return (
    <div className="mt-5">
      <h3 className="font-medium">{t('dealer.secondLife.whyTitle')}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700 dark:text-stone-300">
        {comparisons.map((entry) => (
          <li key={entry.otherRequestId}>
            {t(`dealer.secondLife.why.${entry.decidedBy}`, {
              winner: labels.get(entry.winnerRequestId) ?? entry.winnerRequestId,
              other: labels.get(entry.otherRequestId) ?? entry.otherRequestId,
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SecondLifeCard({
  section,
  assetId,
  usageSinceLastService,
  locale,
  t,
  texts,
}: Props) {
  if (section.kind === 'reserved') {
    const { reservation, comparisons } = section;
    const labels = new Map([[reservation.waitingRequestId, reservation.waitingRequestId]]);
    return (
      <section aria-labelledby="second-life" className={cardClass}>
        <h2 id="second-life" className="text-lg font-semibold">
          {t('dealer.secondLife.reserved.title', { request: reservation.waitingRequestId })}
        </h2>
        <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">
          {reservation.who} ·{' '}
          {t('dealer.secondLife.reserved.by', {
            name: reservation.reservedBy,
            date: formatIsoDate(reservation.reservedAt.slice(0, 10), locale),
          })}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <Fact
            label={t('dealer.secondLife.col.neededBy')}
            value={formatIsoDate(reservation.neededBy, locale)}
          />
          <Fact
            label={t('dealer.secondLife.reserved.target')}
            value={t(`condition.${reservation.targetCondition}`)}
          />
          <Fact
            label={t('dealer.secondLife.col.rent')}
            value={`${formatEuro(reservation.monthlyNetRentCents, locale)} × ${t('dealer.secondLife.months', { count: reservation.termMonths })}`}
          />
          <Fact
            label={t('dealer.secondLife.reserved.cost')}
            value={formatEuro(reservation.refurbishmentCostCents, locale)}
          />
          <Fact
            label={t('dealer.secondLife.reserved.payback')}
            value={t('dealer.secondLife.months', { count: reservation.paybackMonths })}
          />
        </dl>
        <Reasons comparisons={comparisons} labels={labels} t={t} />
      </section>
    );
  }

  const { preview } = section;
  const { decision, matches, rejected } = preview;
  const labels = new Map(
    matches.map((match) => [match.requestId, `${match.requestId} (${match.who})`])
  );
  const shownRejections = rejected.filter((entry) => entry.reason !== 'category_mismatch');
  const otherCategory = rejected.length - shownRejections.length;
  const winner = decision.winnerRequestId;

  return (
    <section aria-labelledby="second-life" className={cardClass}>
      <h2 id="second-life" className="text-lg font-semibold">
        {t('dealer.secondLife.title')}
      </h2>
      <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">
        {t('dealer.secondLife.intro')}
      </p>
      <p
        className={`mt-4 rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset ${
          decision.refurbish
            ? 'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800'
            : 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800'
        }`}
      >
        {t(`dealer.secondLife.decision.${decision.reason}`, { request: winner ?? '' })}
      </p>

      {matches.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <caption className="sr-only">{t('dealer.secondLife.caption')}</caption>
            <thead className="border-b border-stone-200 text-stone-600 dark:border-stone-800 dark:text-stone-400">
              <tr>
                {(
                  [
                    'rank',
                    'request',
                    'neededBy',
                    'minCondition',
                    'term',
                    'rent',
                    'refurbishment',
                    'payback',
                  ] as const
                ).map((column) => (
                  <th key={column} scope="col" className="px-3 py-2 font-medium">
                    {t(`dealer.secondLife.col.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {matches.map((match) => (
                <tr
                  key={match.requestId}
                  className={
                    match.requestId === winner
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/40'
                      : undefined
                  }
                >
                  <td className="px-3 py-2 tabular-nums">{match.rank}</td>
                  <th scope="row" className="px-3 py-2 font-medium">
                    {match.requestId}
                    <span className="block text-xs font-normal text-stone-600 dark:text-stone-400">
                      {match.who}
                    </span>
                    {match.requestId === winner ? (
                      <span className="mt-1 inline-block rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-medium text-white">
                        {t('dealer.secondLife.recommended')}
                      </span>
                    ) : null}
                    {!match.viable ? (
                      <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
                        {t('dealer.secondLife.notWorthIt')}
                      </span>
                    ) : null}
                  </th>
                  <td className="px-3 py-2">{formatIsoDate(match.neededBy, locale)}</td>
                  <td className="px-3 py-2">{t(`condition.${match.minCondition}`)}</td>
                  <td className="px-3 py-2">
                    {t('dealer.secondLife.months', { count: match.termMonths })}
                  </td>
                  <td className="px-3 py-2">{formatEuro(match.monthlyNetRentCents, locale)}</td>
                  <td className="px-3 py-2">
                    {formatEuro(match.refurbishment.totalCostCents, locale)}
                  </td>
                  <td className="px-3 py-2">
                    {match.paybackMonths === null
                      ? '–'
                      : t('dealer.secondLife.months', { count: match.paybackMonths })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Reasons comparisons={decision.comparisons} labels={labels} t={t} />

      {winner ? (
        <div className="mt-5">
          <p className="mb-3 max-w-xl text-sm text-stone-700 dark:text-stone-300">
            {t('dealer.secondLife.reserve.help')}
          </p>
          <ReserveButton
            assetId={assetId}
            availableDate={preview.availableDate}
            usageSinceLastService={usageSinceLastService}
            label={t('dealer.secondLife.reserve.button', { request: winner })}
            texts={texts}
          />
        </div>
      ) : null}

      {shownRejections.length > 0 ? (
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-medium">
            {t('dealer.secondLife.rejected.title', { count: shownRejections.length })}
          </summary>
          <ul className="mt-2 space-y-1 text-stone-700 dark:text-stone-300">
            {shownRejections.map((entry) => (
              <li key={entry.requestId}>
                <span className="font-medium">{entry.requestId}</span>:{' '}
                {t(rejectionKey(entry.reason))}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {otherCategory > 0 ? (
        <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">
          {t('dealer.secondLife.rejected.otherCategory', { count: otherCategory })}
        </p>
      ) : null}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
