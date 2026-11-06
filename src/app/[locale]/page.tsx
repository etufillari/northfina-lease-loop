import { assetBusinessDate } from '@/server/circular/queries';
import { loadCataloguePriceLists } from '@/server/circular/prices';
// The catalogue: every asset, grouped by category, with today's net list price.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { ZodType } from 'zod';
import { AssetCard } from '@/components/asset-card';
import { CatalogueFilterControls } from '@/components/catalogue-filter-controls';
import { CataloguePricing } from '@/components/catalogue-pricing';
import { loadCoefficientTable } from '@/data/load';
import { assetCategorySchema, assetConditionSchema, assetStatusSchema } from '@/data/schemas';
import { filterAssets } from '@/domain/asset-filter';
import { formatEuro } from '@/domain/money';
import { LEASE_TERM_MONTHS, MAX_DOWN_PAYMENT_CENTS } from '@/domain/monthly-rent';
import { listPriceOn } from '@/domain/price-list';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { getActiveUser } from '@/server/active-user';
import { getSavedAssetIds } from '@/server/saved-assets';
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
  const initialDownPayment = readOptionalText(query.downPayment) ?? '0';
  const initialTermMonths = readTerm(query.term);

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const t = getT(locale);
  const today = todayIso(); // the page decides what "today" is; domain code never reads the clock
  const [assets, priceLists, coefficientTable, customer] = await Promise.all([
    listAssets(db),
    loadCataloguePriceLists(db),
    loadCoefficientTable(),
    getActiveUser(),
  ]);
  const savedIds = new Set(await getSavedAssetIds(customer?.id ?? null));
  const filteredAssets = filterAssets(assets, filters);
  const termOptions = LEASE_TERM_MONTHS.map((value) => ({
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

  const assetDates = new Map(
    await Promise.all(
      assets.map(async (asset) => [asset.id, await assetBusinessDate(db, asset.id, today)] as const)
    )
  );

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-8 sm:py-7">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('catalogue.title')}</h1>
        <p className="inline-flex shrink-0 rounded-full bg-[#101d46] px-3 py-1 text-sm font-medium text-white shadow-sm">
          <time dateTime={today}>
            {t('catalogue.pricesOn', { date: formatIsoDate(today, locale) })}
          </time>
        </p>
      </div>
      <div className="max-w-2xl">
        <p className="mt-3 text-lg text-slate-600">{t('catalogue.intro')}</p>
      </div>

      <CatalogueFilterControls
        locale={locale}
        values={filters}
        labels={{
          title: t('catalogue.filters'),
          category: t('category.label'),
          status: t('status.label'),
          condition: t('condition.label'),
          all: t('catalogue.all'),
          reset: t('catalogue.resetFilters'),
        }}
        options={{
          categories: assetCategorySchema.options.map((value) => ({
            value,
            label: t(`category.${value}`),
          })),
          statuses: assetStatusSchema.options.map((value) => ({
            value,
            label: t(`status.${value}`),
          })),
          conditions: assetConditionSchema.options.map((value) => ({
            value,
            label: t(`condition.${value}`),
          })),
        }}
      />

      <CataloguePricing
        key={`${initialDownPayment}-${initialTermMonths}`}
        table={coefficientTable}
        locale={locale}
        labels={pricingLabels}
        termOptions={termOptions}
        initialDownPayment={initialDownPayment}
        initialTermMonths={initialTermMonths}
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
                const price = listPriceOn(priceLists, asset.id, assetDates.get(asset.id) ?? today);
                return (
                  <li key={asset.id}>
                    <AssetCard
                      asset={asset}
                      price={price}
                      locale={locale}
                      t={t}
                      userId={customer?.id ?? null}
                      saved={savedIds.has(asset.id)}
                      saveLabel={t('saved.save')}
                      removeSavedLabel={t('saved.remove')}
                    />
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

function readOptionalText(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') notFound();
  return value;
}

function readTerm(value: string | string[] | undefined): number {
  if (value === undefined) return 0;
  if (typeof value !== 'string' || !LEASE_TERM_MONTHS.some((term) => String(term) === value)) {
    notFound();
  }
  return Number(value);
}
