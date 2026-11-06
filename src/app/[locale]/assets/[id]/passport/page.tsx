// The passport: an item's lives as a timeline (the past lives the data pack counts, then the
// event log), what happened between them, and the CO2 and money each later life saved (decisions
// D15, D80).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ItemArt } from '@/components/item-art';
import {
  Badge,
  Card,
  DateText,
  DefinitionList,
  InfoPopover,
  LifeStamp,
  Notice,
  PageHeader,
} from '@/components/ui';
import { loadCo2Factors, loadRefurbishmentCosts } from '@/data/load';
import { formatEuro } from '@/domain/money';
import type { PassportEvent } from '@/domain/passport';
import { DESIGN_LIFE_MONTHS } from '@/domain/second-life/co2';
import { mandatoryRefurbishmentCents } from '@/domain/second-life/money-saved';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { intlLocale, isLocale, type Locale } from '@/i18n/locales';
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { readPassport } from '@/server/asset-events';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';

/** The two methods, one step per bullet. */
const CO2_POINTS = [
  'passport.method.1',
  'passport.method.2',
  'passport.method.3',
  'passport.method.4',
] as const;
const MONEY_POINTS = [
  'passport.moneyMethod.1',
  'passport.moneyMethod.2',
  'passport.moneyMethod.3',
  'passport.moneyMethod.4',
] as const;

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/assets/[id]/passport'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('passport.title') }) };
}

function GapEvents({
  title,
  events,
  locale,
  t,
}: {
  title: string;
  events: readonly PassportEvent[];
  locale: Locale;
  t: Translate;
}) {
  if (events.length === 0) return null;
  return (
    <li className="ml-4 border-l-2 border-dashed border-line py-2 pl-5">
      <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</p>
      <ul className="mt-1 space-y-1 text-sm">
        {events.map((event) => (
          <li key={event.id} className="flex flex-wrap gap-x-2">
            <DateText iso={event.on_date} locale={locale} className="tabular-nums" />
            <span>{t(`passport.event.${event.kind}`)}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

export default async function PassportPage({
  params,
}: PageProps<'/[locale]/assets/[id]/passport'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const today = await todayForRequest();
  const [result, factors, costs, actor] = await Promise.all([
    readPassport(db, id, today),
    loadCo2Factors(),
    loadRefurbishmentCosts(),
    readActor(db),
  ]);
  if (!result) notFound();
  const { asset, passport, co2, money } = result;
  const kg = (value: number) => formatNumber(value, locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  // A later life from before our records has no known costs: its money is an estimate (D80).
  const moneyEstimated = passport.lives.some((life) => life.index > 0 && life.estimated);
  // A leased item's open life counts only its months so far: the total at the end of the
  // current lease is the same read on the contract's last day.
  const open = passport.lives.at(-1);
  const lease =
    asset.status === 'leased' && open?.end === null && open.contractId
      ? await getContract(db, open.contractId)
      : null;
  const atLeaseEnd = lease ? await readPassport(db, id, lease.endDate) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        title={t('passport.title')}
        intro={t('passport.intro', { make: asset.make, model: asset.model })}
        back={{ href: `/${locale}/catalogue`, label: t('passport.back') }}
      >
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">
            <time dateTime={today}>
              {t('passport.asOf', { date: formatIsoDate(today, locale) })}
            </time>
          </Badge>
          <Badge tone="neutral">
            {t('passport.serial')}: {asset.serial_number}
          </Badge>
        </div>
        {/* D85: the second life is back office; everyone keeps the passport itself. */}
        {actor === ADMIN_ACTOR && asset.status === 'returned' ? (
          <Link
            href={`/${locale}/assets/${encodeURIComponent(asset.id)}/second-life`}
            className="mt-3 inline-block rounded font-bold text-brand-text underline decoration-2 underline-offset-4"
          >
            {t('secondLife.link')}
          </Link>
        ) : null}
      </PageHeader>

      <div className="mb-10 grid items-center gap-6 sm:grid-cols-[1fr_1fr]">
        <div className="rounded-xl bg-muted px-6 pt-8 pb-2">
          <ItemArt category={asset.category} model={asset.model} />
        </div>
        <div className="rounded-xl bg-brand-soft p-6">
          <p className="font-bold text-success-ink">{t('passport.co2Total')}</p>
          <p className="mt-1 font-heading text-5xl font-semibold text-brand-text tabular-nums">
            {t('passport.kg', { kg: kg(co2.totalKg) })}
          </p>
          {lease && atLeaseEnd && atLeaseEnd.co2.totalKg !== co2.totalKg ? (
            <p className="mt-1 text-sm text-ink-muted">
              {t('passport.co2AtLeaseEnd', {
                kg: kg(atLeaseEnd.co2.totalKg),
                date: formatIsoDate(lease.endDate, locale),
              })}
            </p>
          ) : null}
          <p className="mt-4 font-bold text-success-ink">{t('passport.moneyTotal')}</p>
          <p className="mt-1 font-heading text-3xl font-semibold text-brand-text tabular-nums">
            {euro(money.totalCents)}
          </p>
          {moneyEstimated ? (
            <p className="mt-1 text-sm text-ink-muted">{t('passport.moneyEstimated')}</p>
          ) : null}
          {lease && atLeaseEnd && atLeaseEnd.money.totalCents !== money.totalCents ? (
            <p className="mt-1 text-sm text-ink-muted">
              {t('passport.moneyAtLeaseEnd', {
                amount: euro(atLeaseEnd.money.totalCents),
                date: formatIsoDate(lease.endDate, locale),
              })}
            </p>
          ) : null}
          {/* The method, as on the landing page: on hover, not under everything else. */}
          <InfoPopover id="co2-method" label={t('impact.how.label')} className="mt-4">
            <p className="font-bold">{t('impact.how.co2Heading')}</p>
            <ul className="list-disc space-y-1 pl-5">
              {CO2_POINTS.map((key) => (
                <li key={key}>
                  {t(key, {
                    footprint: kg(factors.manufacturing_new_kg[asset.category]),
                    share: formatNumber(
                      Math.round(factors.refurbishment_share_of_new * 100),
                      locale
                    ),
                    designLife: DESIGN_LIFE_MONTHS[asset.category],
                  })}
                </li>
              ))}
            </ul>
            <p className="font-bold">{t('impact.how.moneyHeading')}</p>
            <ul className="list-disc space-y-1 pl-5">
              {MONEY_POINTS.map((key) => (
                <li key={key}>
                  {t(key, {
                    designLife: DESIGN_LIFE_MONTHS[asset.category],
                    mandatory: euro(mandatoryRefurbishmentCents(costs, asset.category)),
                  })}
                </li>
              ))}
            </ul>
          </InfoPopover>
        </div>
      </div>

      <section aria-labelledby="passport-lives">
        <h2 id="passport-lives" className="mb-4 text-3xl">
          {t('passport.timeline')}
        </h2>
        {passport.lives.length === 0 ? (
          <Notice tone="info">{t('passport.noLives')}</Notice>
        ) : (
          <ol className="space-y-2">
            <GapEvents
              title={t('passport.beforeFirst')}
              events={passport.before}
              locale={locale}
              t={t}
            />
            {passport.lives.map((life) => {
              const saved = co2.perLifeKg[life.index] ?? 0;
              const savedCents = money.perLifeCents[life.index] ?? 0;
              const months =
                life.months === null
                  ? null
                  : t(life.end === null ? 'passport.monthsSoFar' : 'passport.months', {
                      count: formatNumber(life.months, locale),
                    });
              return [
                <li key={`life-${life.index}`}>
                  <Card as="article" aria-labelledby={`life-${life.index}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-4">
                        <LifeStamp
                          life={t('stamp.life', { n: life.index + 1 })}
                          note={life.index === 0 ? t('stamp.new') : t('stamp.checked')}
                          later={life.index > 0}
                          tilt={life.index % 2 === 0 ? -8 : 6}
                        />
                        <h3 id={`life-${life.index}`} className="text-2xl">
                          {t('passport.life', { number: life.index + 1 })}
                        </h3>
                      </div>
                      {life.estimated ? null : (
                        <Badge tone={life.end === null ? 'success' : 'neutral'}>
                          {t(`passport.end.${life.endKind ?? 'open'}`)}
                        </Badge>
                      )}
                    </div>
                    {life.estimated ? (
                      <p className="mt-2 text-sm text-ink-muted">
                        {t('passport.pastLife', { months: life.months ?? 0 })}
                      </p>
                    ) : (
                      <DefinitionList
                        variant="grid"
                        className="mt-3"
                        items={[
                          {
                            label: t('passport.dates'),
                            value: t('passport.period', {
                              start: formatIsoDate(life.start!, locale),
                              end: life.end
                                ? formatIsoDate(life.end, locale)
                                : t('passport.ongoing'),
                            }),
                          },
                          ...(months ? [{ label: t('passport.duration'), value: months }] : []),
                          ...(life.contractId
                            ? [{ label: t('passport.contract'), value: life.contractId }]
                            : []),
                        ]}
                      />
                    )}
                    <p className="mt-3 border-t border-line pt-3 text-sm font-medium">
                      {life.index === 0
                        ? t('passport.co2FirstLife')
                        : t(life.estimated ? 'passport.savedLifeEstimated' : 'passport.savedLife', {
                            kg: kg(saved),
                            amount: euro(savedCents),
                          })}
                    </p>
                  </Card>
                </li>,
                <GapEvents
                  key={`gap-${life.index}`}
                  title={t('passport.between')}
                  events={life.between}
                  locale={locale}
                  t={t}
                />,
              ];
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
