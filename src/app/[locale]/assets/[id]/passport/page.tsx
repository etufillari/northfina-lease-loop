// The item passport (card 10, D-036): every life of one item, how each ended, what it took to get
// it ready again, and the CO₂ its extra lives avoided, with the method in plain words.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { loadCustomers } from '@/data/load';
import type { UsageUnit } from '@/data/schemas';
import type { LeaseLoopLife, Readings } from '@/domain/passport';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { intlLocale, isLocale, type Locale } from '@/i18n/locales';
import { db } from '@/server/db';
import { passportView } from '@/server/passport';

export default async function PassportPage({
  params,
}: PageProps<'/[locale]/assets/[id]/passport'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const [view, customers] = await Promise.all([passportView(db, id), loadCustomers()]);
  if (!view) notFound();
  const { asset, passport } = view;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const readings = (r: Readings) =>
    t('passport.readings', {
      condition: t(`condition.${r.condition}`),
      usage: usageText(t, locale, asset.usage.unit, r.usageValue),
    });
  const lessee = (customerId: string) =>
    customers.find((c) => c.id === customerId)?.name ?? t('passport.privateLessee');
  const counted = passport.lives.filter((life) => life.co2 !== null).length;
  const nextNumber = passport.earlierLives.length + passport.lives.length + 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href={`/${locale}/assets/${asset.id}`}
        className="inline-flex items-center gap-2 rounded-full text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        <span aria-hidden="true">←</span> {t('passport.back')}
      </Link>
      <p className="mt-6 eyebrow">
        {t(`category.${asset.category}`)} · {asset.make} · {asset.serial_number}
      </p>
      <h1 className="mt-2 font-display text-3xl leading-tight font-extrabold tracking-tight uppercase sm:text-4xl">
        {t('passport.title', { name: asset.model })}
      </h1>
      <p className="mt-2 text-muted">{t('passport.intro')}</p>

      <section
        aria-labelledby="co2-total"
        className="mt-8 rounded-xl bg-stage p-6 text-stage-fg sm:p-8"
      >
        <h2 id="co2-total" className="font-display text-lg font-bold tracking-tight uppercase">
          {t('passport.co2Title')}
        </h2>
        <p className="mt-2 font-display text-4xl font-extrabold">
          {t('passport.kg', { kg: formatNumber(passport.avoidedKg, locale) })}
        </p>
        <p className="mt-1 text-sm opacity-80">
          {t('passport.co2Counted', { count: formatNumber(counted, locale) })}
        </p>
      </section>

      <section aria-labelledby="lives" className="mt-10">
        <h2 id="lives" className="font-display text-xl font-bold tracking-tight uppercase">
          {t('passport.livesTitle')}
        </h2>
        {passport.earlierLives.length === 0 && passport.lives.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-line p-6 text-muted">
            {t('passport.noLives')}
          </p>
        ) : null}
        <ol className="mt-4 flex flex-col gap-3">
          {passport.earlierLives.map((life) => (
            <li key={`earlier-${life.number}`} className="panel p-4">
              <h3 className="font-semibold">
                {t('passport.life', { number: life.number })} · {t('passport.beforeLeaseLoop')}
              </h3>
              {life.returned ? (
                <p className="mt-1 text-sm">
                  {t('passport.returnedAs', { readings: readings(life.returned) })}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-muted">{t('passport.beforeNote')}</p>
            </li>
          ))}
          {passport.lives.map((life) => (
            <LifeCard
              key={life.contract.id}
              life={life}
              locale={locale}
              t={t}
              euro={euro}
              readings={readings}
              lessee={lessee(life.contract.customerId)}
            />
          ))}
          {passport.nextListing ? (
            <li className="rounded-lg border border-dashed border-line p-4 text-sm">
              {t('passport.nextReady', {
                number: nextNumber,
                date: formatIsoDate(passport.nextListing.listedOn, locale),
                price: euro(passport.nextListing.listPriceCents),
              })}
            </li>
          ) : null}
        </ol>
      </section>

      <section aria-labelledby="method" className="mt-10 panel p-6">
        <h2 id="method" className="font-display text-lg font-bold tracking-tight uppercase">
          {t('passport.methodTitle')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed">{t('passport.method')}</p>
      </section>
    </div>
  );
}

function usageText(t: Translate, locale: Locale, unit: UsageUnit, value: number): string {
  return t(`usage.${unit}`, { value: formatNumber(value, locale) });
}

function LifeCard({
  life,
  locale,
  t,
  euro,
  readings,
  lessee,
}: {
  life: LeaseLoopLife;
  locale: Locale;
  t: Translate;
  euro: (cents: number) => string;
  readings: (r: Readings) => string;
  lessee: string;
}) {
  const { contract, refurbishment, co2 } = life;
  const date = (iso: string) => formatIsoDate(iso, locale);
  const percent = (share: number) =>
    new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: 1 }).format(share * 100);
  return (
    <li className="panel p-4">
      <h3 className="font-semibold">
        {t('passport.life', { number: life.number })} · {lessee}
      </h3>
      <dl className="mt-2 grid gap-1 text-sm">
        {refurbishment ? (
          <Line label={t('passport.prepared')}>
            {t('passport.refurbished', {
              date: date(refurbishment.listedOn),
              before: readings(refurbishment.before),
              after: readings(refurbishment.after),
              cost: euro(refurbishment.refurbishmentCents),
              price: euro(refurbishment.listPriceCents),
            })}
          </Line>
        ) : null}
        <Line label={t('passport.lease')}>
          {t('passport.leaseTerms', {
            sign: date(contract.signDate),
            start: date(contract.startDate),
            term: contract.termMonths,
            rent: euro(contract.monthlyNetRentCents),
            price: euro(contract.listPriceCents),
          })}{' '}
          <Link className="underline" href={`/${locale}/contracts/${contract.id}`}>
            {t('passport.contractLink', { id: contract.id })}
          </Link>
        </Line>
        <Line label={t('passport.delivered')}>
          {t('passport.deliveredAs', {
            readings: readings(life.delivered),
            months: life.ageMonths,
          })}
        </Line>
        <Line label={t('passport.ending')}>
          {contract.ending
            ? t(`passport.ended.${contract.ending.kind}`, {
                date: date(contract.ending.effectiveDate),
              }) +
              (contract.ending.inspection
                ? ` ${t('passport.inspection', { readings: readings(contract.ending.inspection) })}`
                : '')
            : t('passport.ongoing')}
        </Line>
        <Line label={t('passport.co2')}>
          {co2
            ? t('passport.co2Line', {
                kg: formatNumber(co2.avoidedKg, locale),
                manufacturing: formatNumber(co2.manufacturingKg, locale),
                refurbishment: percent(co2.refurbishmentShare),
                share: percent(co2.valueShare),
              })
            : t('passport.firstLife')}
        </Line>
      </dl>
    </li>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
