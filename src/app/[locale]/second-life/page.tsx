// The returns desk (scenario card 9): every returned asset with its second-life decision and
// the reasoning behind it, and a button that carries the decision out (audit-logged).
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { PERSONA_COOKIE, STAFF_PERSONA } from '@/components/persona-cookie';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { asOfFromPage } from '@/server/as-of';
import { db } from '@/server/db';
import { listReturnedDecisions } from '@/server/second-life';
import { listExpiredOffers } from '@/server/waitlist-actions';
import { DecisionCard } from './decision-card';
import { HoldsSection } from './holds-section';

export default async function SecondLifePage({
  params,
  searchParams,
}: PageProps<'/[locale]/second-life'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const { asOf, asOfParam } = await asOfFromPage(await searchParams);
  const persona = (await cookies()).get(PERSONA_COOKIE)?.value ?? null;

  // The desk changes other people's items and offers: staff only.
  if (persona !== STAFF_PERSONA) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t('secondLife.title')}</h1>
        <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('common.staffOnly')}
        </p>
      </div>
    );
  }

  const [desk, expiredOffers] = await Promise.all([
    listReturnedDecisions(db, asOf),
    listExpiredOffers(db, asOf),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('secondLife.title')}</h1>
      <p className="mt-2 max-w-3xl text-stone-700 dark:text-stone-300">{t('secondLife.intro')}</p>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        {t('secondLife.asOf', { date: formatIsoDate(asOf, locale) })}
      </p>

      <HoldsSection
        locale={locale}
        expiredOffers={expiredOffers}
        personaId={persona}
        asOfParam={asOfParam}
      />

      {desk.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('secondLife.empty')}
        </p>
      ) : (
        <div className="mt-8 space-y-6">
          {desk.map(({ assetId, result }) =>
            result.ok ? (
              <DecisionCard
                key={assetId}
                locale={locale}
                preview={result.preview}
                personaId={persona}
                asOfParam={asOfParam}
              />
            ) : (
              <p
                key={assetId}
                className="rounded-xl border border-dashed border-stone-300 p-4 text-sm dark:border-stone-700"
              >
                {assetId}: {t('secondLife.noPrice')}
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
