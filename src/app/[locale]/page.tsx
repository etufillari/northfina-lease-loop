// The catalogue landing page: choose a category before browsing its assets.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { CategoryIllustration } from '@/components/category-illustration';
import { assetCategorySchema } from '@/data/schemas';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets/assets';
import { db } from '@/server/db';

export default async function CataloguePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request because the catalogue counts depend on the database.
  await connection();

  const t = getT(locale);
  const assets = await listAssets(db);

  return (
    <>
      <section className="brand-hero">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="page-title max-w-2xl">{t('catalogue.title')}</h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-[1.4]">{t('catalogue.intro')}</p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        {assets.length === 0 ? (
          <p className="mt-10 rounded-xl border border-dashed border-ink-300 p-6 text-ink-700 dark:border-ink-700 dark:text-ink-300">
            {t('catalogue.empty')}
          </p>
        ) : (
          <section aria-labelledby="category-choices">
            <h2 id="category-choices" className="text-xl font-semibold">
              {t('catalogue.chooseCategory')}
            </h2>
            <p className="mt-2 max-w-2xl text-ink-600 dark:text-ink-400">
              {t('catalogue.categoryIntro')}
            </p>
            <ul className="mt-8 grid gap-6 lg:grid-cols-3">
              {assetCategorySchema.options.map((category) => {
                const count = assets.filter((asset) => asset.category === category).length;
                return (
                  <li key={category}>
                    <Link
                      href={`/${locale}/catalogue/${category}`}
                      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md motion-reduce:transform-none dark:border-ink-800 dark:bg-ink-900 dark:hover:border-brand-700"
                    >
                      <div className="flex items-center justify-center bg-brand-50 px-8 py-10 text-brand-600 lg:px-10 lg:py-14 dark:bg-ink-800 dark:text-brand-300">
                        <div className="w-full max-w-72 transition-transform group-hover:scale-105 motion-reduce:transform-none">
                          <CategoryIllustration category={category} />
                        </div>
                      </div>
                      <div className="flex flex-1 items-start justify-between gap-4 p-6 lg:p-8">
                        <div className="min-w-0">
                          <h3 className="text-xl font-semibold lg:text-2xl">
                            {t(`category.${category}`)}
                          </h3>
                          <p className="mt-2 text-ink-600 dark:text-ink-400">
                            {t('catalogue.itemCount', { count })}
                          </p>
                        </div>
                        <span
                          aria-hidden="true"
                          className="text-2xl text-brand-700 transition-transform group-hover:translate-x-1 motion-reduce:transform-none dark:text-brand-400"
                        >
                          →
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
