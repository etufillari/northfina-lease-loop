// The catalogue landing page: choose a category before browsing its assets.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { assetCategorySchema } from '@/data/schemas';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';

export default async function CataloguePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request because the catalogue counts depend on the database.
  await connection();

  const t = getT(locale);
  const assets = await listAssets(db);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('catalogue.title')}
        </h1>
        <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">{t('catalogue.intro')}</p>
      </div>

      {assets.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('catalogue.empty')}
        </p>
      ) : (
        <section aria-labelledby="category-choices" className="mt-12">
          <h2 id="category-choices" className="text-xl font-semibold">
            {t('catalogue.chooseCategory')}
          </h2>
          <p className="mt-2 max-w-2xl text-stone-600 dark:text-stone-400">
            {t('catalogue.categoryIntro')}
          </p>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {assetCategorySchema.options.map((category) => {
              const count = assets.filter((asset) => asset.category === category).length;
              return (
                <li key={category}>
                  <Link
                    href={`/${locale}/catalogue/${category}`}
                    className="group block h-full rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-stone-800 dark:bg-stone-900 dark:hover:border-emerald-700"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-lg font-semibold">{t(`category.${category}`)}</h3>
                      <span
                        aria-hidden="true"
                        className="text-xl text-emerald-700 transition-transform group-hover:translate-x-1 dark:text-emerald-400"
                      >
                        →
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
                      {t('catalogue.itemCount', { count })}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
