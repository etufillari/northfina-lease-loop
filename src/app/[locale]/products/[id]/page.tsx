import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DemoItemId } from '@/components/demo-item-id';
import { connection } from 'next/server';
import { LeaseCalculator } from '@/components/lease-calculator';
import { ProductDetails } from '@/components/product-details';
import { ItemPassport } from '@/components/item-passport';
import { ProductPhoto } from '@/components/product-photo';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { assetOfferPrice } from '@/domain/asset-offer';
import { invoiceAmounts } from '@/domain/lease-billing';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { toAsset } from '@/server/assets';
import { db } from '@/server/db';
import { appToday, demoModeEnabled } from '@/server/demo-mode';
import { publishedRefurbishment } from '@/server/relisting';

export default async function ProductPage({ params }: PageProps<'/[locale]/products/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const [row, lists, table, vat] = await Promise.all([
    db.asset.findUnique({
      where: { id },
      include: { contracts: { where: { status: 'active' }, select: { id: true } } },
    }),
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  if (!row || row.isFleetHistory) notFound();
  const asset = toAsset(row);
  const available = asset.status === 'available' && row.contracts.length === 0;
  const today = await appToday();
  const price = assetOfferPrice(row, lists, today);
  const rate = vat.rates.find(
    (rate) => rate.valid_from <= today && (rate.valid_to === null || rate.valid_to >= today)
  );
  const vatBasisPoints = rate ? Math.round(rate.rate_percent * 100) : 0;
  const refurbishment =
    row.secondLifePriceCents !== null ? await publishedRefurbishment(db, asset.id) : null;
  const t = getT(locale);

  return (
    <div>
      <div className="mx-auto max-w-[1200px] px-4 pt-6 pb-section-compact sm:px-6 tablet:pb-section">
        <nav
          aria-label={t('product.breadcrumb')}
          className="flex flex-wrap items-center gap-3 text-caption"
        >
          <Link href={`/${locale}`} className="inline-flex min-h-target items-center text-primary">
            {t('product.back')}
          </Link>
          <span aria-hidden="true" className="text-ink-muted">
            /
          </span>
          <Link
            href={`/${locale}#category-${asset.category}`}
            className="inline-flex min-h-target items-center text-primary"
          >
            {t(`category.${asset.category}`)}
          </Link>
          <span aria-hidden="true" className="text-ink-muted">
            /
          </span>
          <span className="text-ink-muted">{asset.model}</span>
        </nav>

        <div className="mt-8 grid items-start gap-10 tablet:grid-cols-2 tablet:items-stretch desktop:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] desktop:gap-12">
          <div className="min-w-0">
            <ProductPhoto
              fillHeight
              showCaption={false}
              assetId={asset.id}
              productName={`${asset.make} ${asset.model}`}
              locale={locale}
              sizes="(min-width: 834px) 1200px, 100vw"
            />
          </div>

          <section aria-labelledby="product-title" className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 text-caption">
              <p className="text-ink-muted">{asset.make}</p>
              {demoModeEnabled() ? <DemoItemId id={asset.id} label={t('demo.itemId')} /> : null}
            </div>
            <h1
              id="product-title"
              className="mt-4 font-display text-display-sm font-semibold wrap-anywhere grid:text-display-md desktop:text-display-lg"
            >
              {asset.make} {asset.model}
            </h1>
            <p className="mt-4 text-body text-ink-muted">{t('product.intro')}</p>
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-4 text-caption">
              <div>
                <dt className="text-ink-muted">{t('condition.label')}</dt>
                <dd className="mt-1 font-semibold">{t(`condition.${asset.condition}`)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">{t('asset.modelYear')}</dt>
                <dd className="mt-1 font-semibold">{asset.model_year}</dd>
              </div>
            </dl>
            <div className="mt-8 rounded-lg border border-hairline p-card">
              <h2 className="text-tagline font-semibold">{t('product.configure')}</h2>
              {!available ? (
                <p className="mt-4 text-caption text-ink-muted" role="status">
                  {t('product.unavailable')}
                </p>
              ) : null}
              {price.ok ? (
                <LeaseCalculator
                  key={asset.id}
                  priceCents={price.priceCents}
                  assetId={asset.id}
                  available={available}
                  vatBasisPoints={vatBasisPoints}
                  table={table}
                  locale={locale}
                />
              ) : (
                <p className="mt-4">{t('asset.noPrice')}</p>
              )}
            </div>
            <div className="mt-6 flex flex-wrap justify-between gap-3 text-caption text-ink-muted">
              <span>{t('pricing.listGross')}</span>
              <span className="font-semibold tabular-nums text-ink">
                {price.ok
                  ? formatEuro(
                      invoiceAmounts(price.priceCents, vatBasisPoints).totalCents,
                      intlLocale[locale]
                    )
                  : t('asset.noPrice')}
              </span>
            </div>
            <p className="mt-2 text-fine text-ink-muted">{t('pricing.roundingRule')}</p>
          </section>
        </div>
      </div>
      <ItemPassport asset={asset} locale={locale} />
      <ProductDetails asset={asset} locale={locale} refurbishment={refurbishment} />
    </div>
  );
}
