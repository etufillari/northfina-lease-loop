import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetCard } from '@/components/asset-card';
import { CataloguePricing } from '@/components/catalogue-pricing';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import { LEASE_TERM_MONTHS } from '@/domain/monthly-rent';
import { listPriceOn } from '@/domain/price-list';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { getActiveUser } from '@/server/active-user';
import { listAssets } from '@/server/assets';
import { getSavedAssetIds } from '@/server/saved-assets';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export default async function SavedPage({ params }: PageProps<'/[locale]/saved'>) {
  const { locale } = await params;
  if (!isLocale(locale) || process.env.NODE_ENV !== 'development') notFound();

  await connection();
  const t = getT(locale);
  const today = todayIso();
  const [customer, assets, priceLists, coefficientTable] = await Promise.all([
    getActiveUser(),
    listAssets(db),
    loadPriceLists(),
    loadCoefficientTable(),
  ]);
  const savedIds = new Set(await getSavedAssetIds(customer?.id ?? null));
  const savedAssets = assets.filter((asset) => savedIds.has(asset.id));

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-8 sm:py-7">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('nav.saved')}</h1>
      <CataloguePricing
        table={coefficientTable}
        locale={locale}
        labels={{
          controls: t('pricing.controls'),
          downPayment: t('pricing.downPayment'),
          downPaymentHelp: '',
          invalidDownPayment: '',
          term: t('pricing.term'),
          quoteUnavailable: t('pricing.quoteUnavailable'),
        }}
        termOptions={LEASE_TERM_MONTHS.map((value) => ({
          value,
          label: t('pricing.months', { count: value }),
        }))}
        initialDownPayment="0"
        initialTermMonths={0}
        showControls={false}
      >
        {savedAssets.length > 0 ? (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {savedAssets.map((asset) => (
              <li key={asset.id}>
                <AssetCard
                  asset={asset}
                  price={listPriceOn(priceLists, asset.id, today)}
                  locale={locale}
                  t={t}
                  userId={customer?.id ?? null}
                  saved
                  saveLabel={t('saved.save')}
                  removeSavedLabel={t('saved.remove')}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            {t('saved.empty')}
          </p>
        )}
      </CataloguePricing>
    </div>
  );
}
