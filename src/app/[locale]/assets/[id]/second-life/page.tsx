// The second life of a returned item (smart problem 3, cards 9 and 10): the condition and
// usage it came back with, every way to relist it with its refurbishment plan, market value
// and D12 price, the rent per term, the waiting list with every D13 step, and the decision.
// Before the assessment it is a preview computed on today's date; after it, the stored
// assessment. The admin's "Assess and relist" writes it. Back office (D85): the waiting list is
// other customers' data, so the page is the admin's alone; anyone else gets a refusal notice.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Badge, Card, DefinitionList, Money, Notice, PageHeader, StaffNote } from '@/components/ui';
import type { AssetCondition, SecondLifeRequest } from '@/data/schemas';
import type { RefurbishmentStep } from '@/domain/refurbishment/plan';
import type { ReturnOption } from '@/domain/second-life/assess';
import type { MatchOutcome, MatchResult } from '@/domain/second-life/match';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type MessageKey, type Translate, type TranslateValues } from '@/i18n/get-t';
import { intlLocale, isLocale, type Locale } from '@/i18n/locales';
import { authzRefusalKey } from '@/components/authz-refusal';
import { ANONYMOUS_ACTOR, readActor } from '@/server/actor';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import type { SecondLifeProposal } from '@/server/second-life';
import { readSecondLifePage } from '@/server/second-life-page';
import { AssessButton } from './assess-button';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/assets/[id]/second-life'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('secondLife.title') }) };
}

type Ctx = {
  locale: Locale;
  t: Translate;
  euro: (cents: number) => string;
  demand: readonly SecondLifeRequest[];
};

const conditionText = (t: Translate, c: AssetCondition) => t(`condition.${c}` as MessageKey);

function stepLabel(step: RefurbishmentStep, { t }: Ctx): string {
  if (step.kind === 'upgrade') {
    return t('secondLife.plan.upgrade', {
      from: conditionText(t, step.from),
      to: conditionText(t, step.to),
    });
  }
  const label = t(`secondLife.step.${step.id}` as MessageKey) ?? step.id;
  return step.quantity > 1 ? t('secondLife.plan.quantity', { label, count: step.quantity }) : label;
}

function verdictText(outcome: MatchOutcome, { t, euro, locale }: Ctx): string {
  switch (outcome.code) {
    case 'candidate':
      return t('secondLife.verdict.candidate', {
        condition: conditionText(t, outcome.params.condition),
        rent: euro(outcome.params.monthlyNetCents),
        total: euro(outcome.params.totalRentCents),
      });
    case 'over_budget':
      return t('secondLife.verdict.over_budget', {
        short: euro(outcome.params.shortCents),
        rent: euro(outcome.params.monthlyNetCents),
        condition: conditionText(t, outcome.params.condition),
      });
    case 'term_not_offered':
    case 'rent_not_priced':
      return t(`secondLife.verdict.${outcome.code}`, { months: outcome.params.termMonths });
    case 'condition_unreachable':
      return t('secondLife.verdict.condition_unreachable', {
        condition: conditionText(t, outcome.params.minCondition),
      });
    case 'expired':
      return t('secondLife.verdict.expired', {
        date: formatIsoDate(outcome.params.neededBy, locale),
      });
    case 'already_matched':
      return t('secondLife.verdict.already_matched');
    case 'other_category':
      return '';
  }
}

function OptionsTable({
  options,
  chosen,
  ctx,
}: {
  options: ReturnOption[];
  /** The condition relisted in; null when nothing is relisted (`relist_unpriced`). */
  chosen: AssetCondition | null;
  ctx: Ctx;
}) {
  const { t, locale, euro } = ctx;
  return (
    <Card
      as="section"
      title={t('secondLife.options.title')}
      titleId="sl-options"
      padded={false}
      className="relative overflow-x-auto"
    >
      <table className="w-full min-w-[52rem] text-left text-sm">
        <thead className="border-b border-line text-ink-muted">
          <tr>
            <th scope="col" className="px-4 py-3">
              {t('secondLife.options.condition')}
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              {t('secondLife.options.work')}
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              {t('secondLife.options.value')}
            </th>
            <th scope="col" className="px-4 py-3">
              {t('secondLife.options.compare')}
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              {t('secondLife.options.price')}
            </th>
            <th scope="col" className="px-4 py-3">
              {t('secondLife.options.rents')}
            </th>
          </tr>
        </thead>
        <tbody>
          {options.map((o) => (
            <tr key={o.condition} className={o.condition === chosen ? 'bg-brand-soft' : undefined}>
              <th scope="row" className="px-4 py-3 align-top font-bold">
                {conditionText(t, o.condition)}{' '}
                <span className="font-normal text-ink-muted">
                  ({t(o.upgrade ? 'secondLife.options.upgraded' : 'secondLife.options.asReturned')})
                </span>
                {o.condition === chosen ? (
                  <Badge tone="success" className="ml-2">
                    {t('secondLife.options.chosen')}
                  </Badge>
                ) : null}
              </th>
              <td className="px-4 py-3 text-right align-top">
                <Money cents={o.plan.totalCents} locale={locale} />
              </td>
              <td className="px-4 py-3 text-right align-top">
                <Money cents={o.marketValue.valueCents} locale={locale} />
              </td>
              <td className="px-4 py-3 align-top">
                {/* D86: the organisers' refurbish-or-not test; a row stored before it has none. */}
                {o.comparison ? (
                  <>
                    {t('secondLife.options.compareLine', {
                      gain: euro(o.comparison.valueGainCents),
                      cost: euro(o.comparison.extraCostCents),
                    })}{' '}
                    <Badge tone={o.comparison.worthIt ? 'success' : 'warning'}>
                      {t(
                        o.comparison.worthIt
                          ? 'secondLife.options.worthIt'
                          : 'secondLife.options.notWorthIt'
                      )}
                    </Badge>
                  </>
                ) : (
                  <span className="text-ink-muted">{t('secondLife.options.compareBase')}</span>
                )}
              </td>
              <td className="px-4 py-3 text-right align-top font-bold">
                <Money cents={o.secondLifeFinancedCents} locale={locale} />
              </td>
              <td className="px-4 py-3 align-top">
                <ul>
                  {o.rents.map((r) => (
                    <li key={r.termMonths} className="tabular-nums">
                      {r.monthlyNetCents === null
                        ? t('secondLife.options.notPriced', { months: r.termMonths })
                        : t('secondLife.options.rentLine', {
                            months: r.termMonths,
                            amount: euro(r.monthlyNetCents),
                          })}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function PlanAndValue({ proposal, ctx }: { proposal: SecondLifeProposal; ctx: Ctx }) {
  const { t, locale, euro } = ctx;
  const { relist } = proposal.match;
  const { plan, marketValue } = relist;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card as="section" title={t('secondLife.plan.title')} titleId="sl-plan">
        {plan.steps.length === 0 ? (
          <p>{t('secondLife.plan.none')}</p>
        ) : (
          <dl>
            {plan.steps.map((step) => (
              <div key={step.id} className="rule-dashed flex justify-between gap-4 border-b-2 py-2">
                <dt>{stepLabel(step, ctx)}</dt>
                <dd className="font-bold">
                  <Money cents={step.costCents} locale={locale} />
                </dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 py-2">
              <dt className="font-bold">{t('secondLife.plan.total')}</dt>
              <dd className="font-bold">
                <Money cents={plan.totalCents} locale={locale} />
              </dd>
            </div>
          </dl>
        )}
        {plan.steps.some((step) => step.kind === 'fixed' && step.resetsUsage) ? (
          <p className="mt-3 text-sm text-ink-muted">{t('secondLife.plan.usageReset')}</p>
        ) : null}
      </Card>
      <Card as="section" title={t('secondLife.value.title')} titleId="sl-value">
        <p className="tabular-nums">
          {t('secondLife.value.formula', {
            price: euro(proposal.input.newPriceCents),
            curve: formatNumber(marketValue.curvePercent, locale),
            months: marketValue.ageMonths,
            condition: formatNumber(marketValue.conditionMultiplier, locale),
            usage: formatNumber(100 + marketValue.usageAdjustmentPercent, locale),
            value: euro(marketValue.valueCents),
          })}
        </p>
        <p className="mt-3 font-bold tabular-nums">
          {t('secondLife.value.price', {
            value: euro(marketValue.valueCents),
            work: euro(plan.totalCents),
            price: euro(relist.secondLifeFinancedCents),
          })}
        </p>
      </Card>
    </div>
  );
}

function WaitingList({ match, ctx }: { match: MatchResult; ctx: Ctx }) {
  const { t, locale, euro } = ctx;
  const same = match.verdicts.filter((v) => v.outcome.code !== 'other_category');
  const others = match.verdicts.length - same.length;
  const rankOf = new Map(match.ranking.map((r) => [r.demandId, r]));
  return (
    <Card
      as="section"
      title={t('secondLife.match.title')}
      titleId="sl-match"
      padded={false}
      className="relative overflow-x-auto"
    >
      <p className="px-4 pt-4 text-sm text-ink-muted sm:px-6">{t('secondLife.match.rules')}</p>
      <table className="mt-3 w-full min-w-[44rem] text-left text-sm">
        <thead className="border-b border-line text-ink-muted">
          <tr>
            <th scope="col" className="px-4 py-3">
              {t('secondLife.match.rank')}
            </th>
            <th scope="col" className="px-4 py-3">
              {t('secondLife.match.entry')}
            </th>
            <th scope="col" className="px-4 py-3">
              {t('secondLife.match.wants')}
            </th>
            <th scope="col" className="px-4 py-3">
              {t('secondLife.match.neededBy')}
            </th>
            <th scope="col" className="px-4 py-3">
              {t('secondLife.match.verdict')}
            </th>
          </tr>
        </thead>
        <tbody>
          {[...same]
            .sort(
              (a, b) => (rankOf.get(a.demandId)?.rank ?? 99) - (rankOf.get(b.demandId)?.rank ?? 99)
            )
            .map((v) => {
              const ranked = rankOf.get(v.demandId);
              const entry = ctx.demand.find((d) => d.id === v.demandId);
              return (
                <tr
                  key={v.demandId}
                  className={ranked?.rank === 1 ? 'bg-brand-soft' : 'border-t border-line'}
                >
                  <td className="px-4 py-3 align-top">
                    {ranked ? (
                      <>
                        <span className="font-bold tabular-nums">{ranked.rank}</span>{' '}
                        <span className="text-ink-muted">
                          {ranked.decidedBy === null
                            ? t('secondLife.rankStep.winner')
                            : t(`secondLife.rankStep.${ranked.decidedBy}`)}
                        </span>
                      </>
                    ) : (
                      '–'
                    )}
                  </td>
                  <th scope="row" className="px-4 py-3 align-top font-bold">
                    {v.demandId}
                  </th>
                  <td className="px-4 py-3 align-top">
                    {entry
                      ? t('secondLife.match.wantsValue', {
                          condition: conditionText(t, entry.min_condition),
                          months: entry.preferred_term_months,
                          budget: euro(entry.max_monthly_net_rent_cents),
                        })
                      : null}
                  </td>
                  <td className="px-4 py-3 align-top tabular-nums">
                    <time dateTime={v.neededBy}>{formatIsoDate(v.neededBy, locale)}</time>
                  </td>
                  <td className="px-4 py-3 align-top">{verdictText(v.outcome, ctx)}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
      {others > 0 ? (
        <p className="px-4 pb-4 text-sm text-ink-muted sm:px-6">
          {t('secondLife.match.otherCategories', { count: others })}
        </p>
      ) : null}
    </Card>
  );
}

function Decision({ match, ctx }: { match: MatchResult; ctx: Ctx }) {
  const { t, euro } = ctx;
  const { decision, winner } = match;
  const refurbish = t(
    decision.params.upgrade ? 'secondLife.decision.refurbishYes' : 'secondLife.decision.refurbishNo'
  );
  const condition = conditionText(t, decision.params.condition);
  return (
    <Notice
      tone={decision.code === 'relist_unpriced' ? 'warning' : 'success'}
      title={t('secondLife.decision.title')}
    >
      <p>
        {decision.code === 'relist_for_winner'
          ? t('secondLife.decision.relist_for_winner', {
              condition,
              demandId: decision.params.demandId,
              refurbish,
            })
          : t(`secondLife.decision.${decision.code}`, { condition, refurbish })}
      </p>
      {winner ? (
        <p className="mt-1">
          {t('secondLife.decision.rent', {
            rent: euro(winner.monthlyNetCents),
            months: winner.termMonths,
          })}
        </p>
      ) : null}
    </Notice>
  );
}

export default async function SecondLifePage({
  params,
}: PageProps<'/[locale]/assets/[id]/second-life'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection(); // the assessment depends on today and the database

  const t = getT(locale);
  const today = await todayForRequest(); // read once here, passed down
  const actor = await readActor(db);
  // D85: back office. Authorized before anything is read; anyone but the admin gets the refusal.
  const read = await readSecondLifePage(db, actor, id, today);
  if (!read.ok) {
    const refusal =
      read.reason.code === 'admin_only'
        ? t('secondLife.backOfficeOnly')
        : t(authzRefusalKey(read.reason.code) ?? 'authz.refusal.not_signed_in');
    return (
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
        <PageHeader title={t('secondLife.title')} />
        <Notice tone={actor === ANONYMOUS_ACTOR ? 'info' : 'warning'}>{refusal}</Notice>
      </div>
    );
  }
  const { asset, stored, preview, demand } = read;
  if (!asset) notFound();
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const ctx: Ctx = { locale, t, euro, demand };

  const proposal: SecondLifeProposal | null = preview?.ok ? preview.proposal : stored;
  // Nothing any term can price and nobody waiting: no option is relisted, so none is marked
  // chosen and there is nothing to assess (the route would refuse it with 422).
  const unpriced = proposal?.match.decision.code === 'relist_unpriced';

  const facts = proposal
    ? [
        {
          label: t('condition.label'),
          value: conditionText(t, proposal.assessment.returnedCondition),
        },
        {
          label: t('asset.usage'),
          value: t(`usage.${proposal.input.usage.unit}` as MessageKey, {
            value: formatNumber(proposal.input.usage.value, locale),
          }),
        },
        {
          label: t('secondLife.returned.age'),
          value: t('secondLife.returned.ageValue', { months: proposal.assessment.ageMonths }),
        },
        { label: t('secondLife.returned.newPrice'), value: euro(proposal.input.newPriceCents) },
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        title={t('secondLife.title')}
        intro={t('secondLife.intro')}
        back={{ href: `/${locale}/assets/${asset.id}`, label: `${asset.make} ${asset.model}` }}
      >
        <StaffNote>{t('secondLife.staffNote')}</StaffNote>
      </PageHeader>

      {preview?.ok ? (
        <Notice tone="info">
          {t('secondLife.preview', { date: formatIsoDate(today, locale) })}
        </Notice>
      ) : stored ? (
        <Notice tone="info">
          {t('secondLife.assessedOn', { date: formatIsoDate(stored.assessedOn, locale) })}
        </Notice>
      ) : (
        <Notice tone="warning">
          {t('secondLife.notReturned', { status: t(`status.${asset.status}` as MessageKey) })}
        </Notice>
      )}
      {preview && !preview.ok ? (
        <Notice tone="error">
          {t(
            `secondLife.refusal.${preview.reason.code}` as MessageKey,
            preview.reason.params as TranslateValues
          )}
        </Notice>
      ) : null}

      {proposal ? (
        <>
          <Card as="section" title={t('secondLife.returned.title')} titleId="sl-returned">
            <DefinitionList items={facts} />
          </Card>
          <OptionsTable
            options={proposal.assessment.options}
            chosen={unpriced ? null : proposal.match.relist.condition}
            ctx={ctx}
          />
          {unpriced ? null : <PlanAndValue proposal={proposal} ctx={ctx} />}
          <WaitingList match={proposal.match} ctx={ctx} />
          <Decision match={proposal.match} ctx={ctx} />
        </>
      ) : null}

      {/* Only the admin reaches this far (D85), and only the admin assesses. */}
      {preview?.ok && !unpriced ? <AssessButton assetId={asset.id} locale={locale} /> : null}

      <div className="flex flex-wrap gap-6">
        <Link
          href={`/${locale}/assets/${asset.id}/passport`}
          className="rounded font-bold text-brand-text underline decoration-2 underline-offset-4"
        >
          {t('secondLife.passportLink')}
        </Link>
        {asset.status === 'available' && stored ? (
          <Link
            href={`/${locale}/assets/${asset.id}`}
            className="rounded font-bold text-brand-text underline decoration-2 underline-offset-4"
          >
            {t('secondLife.priceLink')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
