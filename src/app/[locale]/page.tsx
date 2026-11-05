// The catalogue: every asset with today's net list price in one list, searchable, filterable
// and sortable. The first render uses the filters in the URL (?q=&category=&status=&sort=);
// after that, CatalogueBrowser updates the list live in the browser.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { CatalogueBrowser } from '@/components/catalogue-browser';
import { loadPriceLists } from '@/data/load';
import { parseCatalogueQuery } from '@/domain/catalogue';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export default async function CataloguePage({ params, searchParams }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const t = getT(locale);
  const today = todayIso(); // the page decides what "today" is; domain code never reads the clock
  const query = parseCatalogueQuery(await searchParams);
  const [assets, priceLists] = await Promise.all([listAssets(db), loadPriceLists()]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('catalogue.title')}
        </h1>
        <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">{t('catalogue.intro')}</p>
        <p className="mt-5 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-900 ring-1 ring-emerald-200 ring-inset dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800">
          <time dateTime={today}>
            {t('catalogue.pricesOn', { date: formatIsoDate(today, locale) })}
          </time>
        </p>
      </div>

      <CatalogueBrowser
        assets={assets}
        priceLists={priceLists}
        today={today}
        initialQuery={query}
        locale={locale}
      />
    </div>
  );
}
