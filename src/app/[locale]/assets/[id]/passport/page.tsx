// The item passport (scenario card 10): every recorded event of one asset across its lives,
// and the CO2 its reuse avoids, with the formula and the inputs shown.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { asOfFromPage } from '@/server/as-of';
import { db } from '@/server/db';
import { assetPassport } from '@/server/passport';
import { eventDetail, eventLabel } from './event-detail';

export default async function PassportPage({
  params,
  searchParams,
}: PageProps<'/[locale]/assets/[id]/passport'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const { asOf, asOfParam } = await asOfFromPage(await searchParams);
  const passport = await assetPassport(db, id, asOf);
  if (!passport) notFound();
  const { asset, co2 } = passport;
  const suffix = asOfParam ? `?asOf=${asOfParam}` : '';
  // Lives before the first recorded refurbishment happened before the app kept records.
  const firstRecordedLife = passport.recordedLives[0]?.life ?? passport.currentLife;
  const undocumentedLives = firstRecordedLife - 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href={`/${locale}/assets/${asset.id}${suffix}`}
        className="text-sm text-emerald-800 hover:underline dark:text-emerald-300"
      >
        ← {t('passport.back')}
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm text-stone-600 dark:text-stone-400">{t('passport.title')}</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {asset.make} {asset.model}
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {t('passport.serial', { serial: asset.serial_number })} ·{' '}
            {t(`category.${asset.category}` as MessageKey)} · {asset.model_year}
          </p>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">
          {t('passport.life', { n: passport.currentLife })}
        </span>
      </div>

      <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950">
        <h2 className="text-sm font-semibold">{t('passport.co2Title')}</h2>
        {co2 ? (
          <>
            <p className="mt-2 text-2xl font-semibold text-emerald-900 dark:text-emerald-200">
              {formatNumber(co2.kg, locale)} kg CO₂e
            </p>
            <p className="mt-1 text-sm">
              {t('passport.co2Current', { kg: formatNumber(co2.kg, locale) })}
            </p>
            <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">
              {t('passport.co2Formula', {
                manufacturing: formatNumber(co2.manufacturingNewKg, locale),
                share: formatNumber(co2.refurbishmentShareOfNew, locale),
                fraction: formatNumber(
                  Math.round(co2.remainingValueFraction * 1000) / 1000,
                  locale
                ),
                value: euro(co2.marketValueCents),
                original: euro(co2.originalListPriceCents),
              })}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm">{t('passport.noCo2')}</p>
        )}
        {passport.recordedLives.length > 0 && (
          <>
            <h3 className="mt-4 text-xs font-semibold">{t('passport.co2Lives')}</h3>
            <ul className="mt-1 space-y-0.5 text-sm">
              {passport.recordedLives.map((life) => (
                <li key={`${life.life}-${life.onDate}`}>
                  {t('passport.co2Life', {
                    life: life.life,
                    date: formatIsoDate(life.onDate, locale),
                    kg: formatNumber(life.co2AvoidedKg, locale),
                  })}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t('passport.timeline')}</h2>
        {undocumentedLives > 0 && (
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            {t('passport.earlierLives', { count: undocumentedLives })}
          </p>
        )}
        {passport.events.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-700 dark:border-stone-700 dark:text-stone-300">
            {t('passport.noEvents')}
          </p>
        ) : (
          <ol className="mt-4 border-l-2 border-emerald-200 dark:border-emerald-800">
            {passport.events.map((event) => {
              const detail = eventDetail(locale, event);
              return (
                <li key={event.id} className="relative mb-5 ml-5 last:mb-0">
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 -left-[1.6rem] h-3 w-3 rounded-full bg-emerald-600 ring-4 ring-white dark:bg-emerald-400 dark:ring-stone-950"
                  />
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {formatIsoDate(event.onDate, locale)}
                  </p>
                  <p className="font-medium">
                    {event.contractId ? (
                      <Link
                        href={`/${locale}/contracts/${event.contractId}${suffix}`}
                        className="hover:underline"
                      >
                        {eventLabel(locale, event.type)}
                      </Link>
                    ) : (
                      eventLabel(locale, event.type)
                    )}
                  </p>
                  {detail && <p className="text-sm text-stone-700 dark:text-stone-300">{detail}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
