import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { CatalogueGrid } from '@/components/catalogue-grid';
import { loadPriceLists, loadResidualCurves } from '@/data/load';
import { assetCategorySchema } from '@/data/schemas';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets/assets';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export default async function CategoryPage({
  params,
}: PageProps<'/[locale]/catalogue/[category]'>) {
  const { locale, category: categoryParam } = await params;
  if (!isLocale(locale)) notFound();

  const categoryResult = assetCategorySchema.safeParse(categoryParam);
  if (!categoryResult.success) notFound();
  const category = categoryResult.data;

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const t = getT(locale);
  const today = todayIso(); // the page decides what "today" is; domain code never reads the clock
  const [assets, priceLists, residualCurves] = await Promise.all([
    listAssets(db, { category }),
    loadPriceLists(),
    loadResidualCurves(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-brand-800 dark:text-brand-300">
          {t('catalogue.title')}
        </p>
        <h1 className="page-title mt-2">{t(`category.${category}`)}</h1>
        <p className="mt-5 inline-flex rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-900 ring-1 ring-brand-200 ring-inset dark:bg-brand-950 dark:text-brand-200 dark:ring-brand-800">
          <time dateTime={today}>
            {t('catalogue.pricesOn', { date: formatIsoDate(today, locale) })}
          </time>
        </p>
      </div>

      {assets.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-ink-300 p-6 text-ink-700 dark:border-ink-700 dark:text-ink-300">
          {t('catalogue.empty')}
        </p>
      ) : (
        <section aria-labelledby="category-assets" className="mt-12">
          <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-ink-200 pb-3 dark:border-ink-800">
            <p className="text-sm text-ink-600 dark:text-ink-400">
              {t('catalogue.itemCount', { count: assets.length })}
            </p>
          </div>
          <CatalogueGrid
            assets={assets}
            locale={locale}
            priceLists={priceLists}
            residualCurves={residualCurves}
            today={today}
            t={t}
          />
        </section>
      )}
    </div>
  );
}
