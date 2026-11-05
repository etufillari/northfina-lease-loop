// The catalogue: every asset, grouped by category, with today's net list price.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { ZodType } from 'zod';
import { AssetCard } from '@/components/asset-card';
import { CataloguePricing } from '@/components/catalogue-pricing';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import { assetCategorySchema, assetConditionSchema, assetStatusSchema } from '@/data/schemas';
import { filterAssets } from '@/domain/asset-filter';
import { formatEuro } from '@/domain/money';
import { MAX_DOWN_PAYMENT_CENTS } from '@/domain/monthly-rent';
import { listPriceOn } from '@/domain/price-list';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export default async function CataloguePage({ params, searchParams }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const query = await searchParams;
  const filters = {
    category: readFilter(assetCategorySchema, query.category),
    status: readFilter(assetStatusSchema, query.status),
    condition: readFilter(assetConditionSchema, query.condition),
  };

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const t = getT(locale);
  const today = todayIso(); // the page decides what "today" is; domain code never reads the clock
  const [assets, priceLists, coefficientTable] = await Promise.all([
    listAssets(db),
    loadPriceLists(),
    loadCoefficientTable(),
  ]);
  const filteredAssets = filterAssets(assets, filters);
  const termOptions = [0, 12, 24, 36, 48].map((value) => ({
    value,
    label: t('pricing.months', { count: value }),
  }));
  const maximumDownPayment = formatEuro(MAX_DOWN_PAYMENT_CENTS, intlLocale[locale]);
  const pricingLabels = {
    controls: t('pricing.controls'),
    downPayment: t('pricing.downPayment'),
    downPaymentHelp: t('pricing.downPaymentHelp', { maximum: maximumDownPayment }),
    invalidDownPayment: t('pricing.invalidDownPayment', { maximum: maximumDownPayment }),
    term: t('pricing.term'),
    quoteUnavailable: t('pricing.quoteUnavailable'),
  };
  const groups = assetCategorySchema.options
    .map((category) => ({
      category,
      assets: filteredAssets.filter((asset) => asset.category === category),
    }))
    .filter((group) => group.assets.length > 0);

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

      <form
        action={`/${locale}`}
        method="get"
        className="mt-8 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
      >
        <h2 className="sr-only">{t('catalogue.filters')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            id="category"
            label={t('category.label')}
            value={filters.category}
            options={assetCategorySchema.options.map((value) => ({
              value,
              label: t(`category.${value}`),
            }))}
            allLabel={t('catalogue.all')}
          />
          <FilterSelect
            id="status"
            label={t('status.label')}
            value={filters.status}
            options={assetStatusSchema.options.map((value) => ({
              value,
              label: t(`status.${value}`),
            }))}
            allLabel={t('catalogue.all')}
          />
          <FilterSelect
            id="condition"
            label={t('condition.label')}
            value={filters.condition}
            options={assetConditionSchema.options.map((value) => ({
              value,
              label: t(`condition.${value}`),
            }))}
            allLabel={t('catalogue.all')}
          />
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              {t('catalogue.applyFilters')}
            </button>
          </div>
        </div>
      </form>

      <CataloguePricing
        table={coefficientTable}
        locale={locale}
        labels={pricingLabels}
        termOptions={termOptions}
      >
        {assets.length === 0 ? (
          <p className="mt-10 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
            {t('catalogue.empty')}
          </p>
        ) : null}

        {assets.length > 0 && filteredAssets.length === 0 ? (
          <p className="mt-10 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
            {t('catalogue.noResults')}
          </p>
        ) : null}

        {groups.map((group) => (
          <section
            key={group.category}
            aria-labelledby={`category-${group.category}`}
            className="mt-12"
          >
            <div className="flex items-baseline justify-between gap-4 border-b border-stone-200 pb-3 dark:border-stone-800">
              <h2 id={`category-${group.category}`} className="text-xl font-semibold">
                {t(`category.${group.category}`)}
              </h2>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                {t('catalogue.itemCount', { count: group.assets.length })}
              </p>
            </div>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.assets.map((asset) => {
                const price = listPriceOn(priceLists, asset.id, today);
                return (
                  <li key={asset.id}>
                    <AssetCard asset={asset} price={price} locale={locale} t={t} />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </CataloguePricing>
    </div>
  );
}

function readFilter<T extends string>(
  schema: ZodType<T>,
  value: string | string[] | undefined
): T | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') notFound();

  const result = schema.safeParse(value);
  if (!result.success) notFound();
  return result.data;
}

function FilterSelect<T extends string>({
  id,
  label,
  value,
  options,
  allLabel,
}: {
  id: string;
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  allLabel: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-stone-700 dark:text-stone-300">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          name={id}
          defaultValue={value ?? ''}
          className="mt-1 block w-full appearance-none rounded-lg border border-stone-300 bg-white py-2 pr-10 pl-3 text-sm text-stone-900 shadow-sm focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
        >
          <option value="">{allLabel}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute top-1/2 right-[18px] size-4 -translate-y-1/2 text-stone-600 dark:text-stone-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </div>
    </div>
  );
}
