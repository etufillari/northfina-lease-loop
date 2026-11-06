// The catalogue: leasable assets with their monthly price (no down payment) per term.
// Filtering and the category choice are client-side in CatalogueBrowser; this page loads
// data and prices every asset at every term, so the browser never computes money itself.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { CatalogueBrowser, type CatalogueItem } from '@/components/catalogue-browser';
import { customerPersona, PERSONA_COOKIE } from '@/components/persona-cookie';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { assetCategorySchema, type AssetCategory } from '@/data/schemas';
import { quoteFor } from '@/domain/pricing';
import { listPriceOn } from '@/domain/price-list';
import { grossCents, vatRateOn } from '@/domain/vat';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { assetImageUrls } from '@/server/asset-images';
import { asOfFromPage } from '@/server/as-of';
import { db } from '@/server/db';
import { secondLifePrices } from '@/server/quotes';

/** Statuses a customer can still get: leased-out and sold items stay off the page. */
const VISIBLE_STATUSES = new Set(['available', 'reserved', 'returned']);

export default async function CataloguePage({ params, searchParams }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const t = getT(locale);
  // The page decides what "today" is (the time-travel control or ?asOf=); domain code
  // never reads the clock.
  const { asOf: today, asOfParam } = await asOfFromPage(await searchParams);
  const persona = customerPersona((await cookies()).get(PERSONA_COOKIE)?.value);
  const [assets, priceLists, secondLife, table, vatRates, imageRows, customer] = await Promise.all([
    listAssets(db),
    loadPriceLists(),
    secondLifePrices(db),
    loadCoefficientTable(),
    loadVatRates(),
    db.asset.findMany({ select: { id: true, image_path: true } }),
    persona ? db.customer.findUnique({ where: { id: persona } }) : null,
  ]);
  const images = assetImageUrls(imageRows);
  const vat = vatRateOn(vatRates, today);

  const terms = Object.keys(table.end_of_term_buyout_percent_of_financed)
    .map(Number)
    .sort((a, b) => a - b);

  const items: CatalogueItem[] = assets
    .filter((asset) => VISIBLE_STATUSES.has(asset.status))
    .map((asset) => {
      const listed = listPriceOn(priceLists, asset.id, today);
      // A refurbished item is priced at the desk's re-price, not the new-item price list.
      const reprice = secondLife[asset.id];
      const priceCents = listed.ok ? (reprice ?? listed.priceCents) : null;
      const monthly: CatalogueItem['monthly'] = {};
      for (const term of terms) {
        if (priceCents === null || !vat.ok) {
          monthly[term] = null;
          continue;
        }
        const quote = quoteFor({
          listPriceCents: priceCents,
          downPaymentCents: 0,
          termMonths: term,
          table,
        });
        monthly[term] = quote.ok
          ? {
              netCents: quote.quote.monthlyNetRentCents,
              grossCents: grossCents(quote.quote.monthlyNetRentCents, vat.rateBasisPoints),
            }
          : null;
      }
      return {
        asset,
        imageUrl: images[asset.id] ?? null,
        secondLife: reprice !== undefined,
        monthly,
      };
    });

  const preferred = assetCategorySchema.options.includes(
    customer?.preferred_category as AssetCategory
  )
    ? (customer!.preferred_category as AssetCategory)
    : 'e_bike';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('catalogue.title')}
        </h1>
        <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">{t('catalogue.intro')}</p>
        <p className="mt-3">
          <Link
            href={`/${locale}/fleet${asOfParam ? `?asOf=${asOfParam}` : ''}`}
            className="text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
          >
            {t('catalogue.fleetLink')}
          </Link>
        </p>
      </div>

      {items.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('catalogue.empty')}
        </p>
      ) : (
        <CatalogueBrowser
          locale={locale}
          items={items}
          terms={terms}
          vatRatePercent={vat.ok ? vat.ratePercent : null}
          defaultCategory={preferred}
          personaId={persona}
          asOfParam={asOfParam}
        />
      )}
    </div>
  );
}
