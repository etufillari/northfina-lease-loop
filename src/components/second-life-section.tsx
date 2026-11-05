// Second life on a returned item's page (Spine step 7, D-035): who passed it on, who is waiting
// for it and why, and the form to refurbish and re-list it. A server component.
import type { SecondLifeRequest } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import type { Exclusion, RankedMatch } from '@/domain/waiting-list';
import { formatIsoDate } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { SecondLifeView } from '@/server/second-life';
import { RelistForm } from './relist-form';

export type SecondLifeSectionProps = {
  locale: Locale;
  view: SecondLifeView;
  demand: SecondLifeRequest[];
  /** Persona names by id, to name a pass-on next lessee. */
  names: Record<string, string>;
};

export function SecondLifeSection({ locale, view, demand, names }: SecondLifeSectionProps) {
  const t = getT(locale);
  const { asset, match } = view;
  const requests = new Map(demand.map((r) => [r.id, r]));
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const otherCategory = match.excluded.filter((e) => e.reasons.includes('category_mismatch'));
  const excluded = match.excluded.filter((e) => !e.reasons.includes('category_mismatch'));

  return (
    <section aria-labelledby="second-life" className="flex flex-col gap-6">
      <div>
        <h2 id="second-life" className="font-display text-2xl font-bold tracking-tight uppercase">
          {t('secondLife.title')}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('secondLife.intro')}</p>
      </div>

      {view.passedOnTo ? (
        <p role="status" className="rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn-fg">
          {t('secondLife.passedOn', { name: names[view.passedOnTo] ?? view.passedOnTo })}
        </p>
      ) : null}

      <RelistForm
        locale={locale}
        assetId={asset.id}
        unit={asset.usage.unit}
        modelYear={asset.model_year}
        firstLeasePriceListVersion={view.firstLeasePriceListVersion}
        options={view.options}
        suggested={view.suggested}
      />

      <section aria-labelledby="waiting-list" className="panel p-5 sm:p-6">
        <h3 id="waiting-list" className="font-display text-lg font-bold tracking-tight uppercase">
          {t('secondLife.waitingTitle')}
        </h3>
        <p className="mt-1 text-sm text-muted">{t('secondLife.waitingIntro')}</p>
        {match.ranked.length === 0 ? (
          <p className="mt-4 text-sm">{t('secondLife.nobody')}</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-3">
            {match.ranked.map((m) => (
              <Ranked
                key={m.requestId}
                match={m}
                request={requests.get(m.requestId)}
                t={t}
                euro={euro}
                locale={locale}
              />
            ))}
          </ol>
        )}

        {excluded.length > 0 ? (
          <>
            <h4 className="eyebrow mt-6">{t('secondLife.excludedTitle')}</h4>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {excluded.map((e) => (
                <Excluded
                  key={e.requestId}
                  exclusion={e}
                  request={requests.get(e.requestId)}
                  t={t}
                  euro={euro}
                />
              ))}
            </ul>
          </>
        ) : null}
        {otherCategory.length > 0 ? (
          <p className="mt-3 text-xs text-muted">
            {t('secondLife.otherCategory', { count: otherCategory.length })}
          </p>
        ) : null}
      </section>
    </section>
  );
}

function Ranked(props: {
  match: RankedMatch;
  request: SecondLifeRequest | undefined;
  t: Translate;
  euro: (cents: number) => string;
  locale: Locale;
}) {
  const { match, request, t, euro } = props;
  return (
    <li className="rounded-lg border border-line p-3">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-display font-bold">{t('secondLife.rank', { rank: match.rank })}</span>
        <span className="font-semibold">{request?.who ?? match.requestId}</span>
        <span className="text-xs text-muted">{match.requestId}</span>
      </p>
      <p className="mt-1 text-sm text-muted">
        {t('secondLife.wants', {
          condition: t(`condition.${request?.min_condition ?? match.plan.conditionAfter}`),
          term: match.termMonths,
          date: formatIsoDate(match.neededBy, props.locale),
        })}
      </p>
      <p className="mt-1 text-sm tabular-nums">
        {t('secondLife.rentVsBudget', {
          rent: euro(match.monthlyRentCents),
          budget: euro(match.maxMonthlyRentCents),
          condition: t(`condition.${match.plan.conditionAfter}`),
        })}{' '}
        · {t('secondLife.refurbCost', { cost: euro(match.plan.totalCents) })}
      </p>
      <p className="mt-1 text-sm font-medium">
        {match.winsOverNextBy
          ? t(`secondLife.wins.${match.winsOverNextBy}`)
          : t('secondLife.wins.last')}
      </p>
    </li>
  );
}

function Excluded(props: {
  exclusion: Exclusion;
  request: SecondLifeRequest | undefined;
  t: Translate;
  euro: (cents: number) => string;
}) {
  const { exclusion, request, t, euro } = props;
  const rent = exclusion.monthlyRentCents === null ? '' : euro(exclusion.monthlyRentCents);
  return (
    <li className="flex flex-wrap gap-x-2">
      <span className="font-semibold">{request?.who ?? exclusion.requestId}</span>
      <span className="text-xs text-muted">{exclusion.requestId}</span>
      <span className="text-muted">
        {exclusion.reasons
          .map((reason) =>
            t(`secondLife.reason.${reason}`, {
              rent,
              budget: request ? euro(request.max_monthly_net_rent_cents) : '',
            })
          )
          .join(' · ')}
      </span>
    </li>
  );
}
