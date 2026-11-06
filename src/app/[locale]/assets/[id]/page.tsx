// One item in detail: what we know about it, today's net list price, the monthly price with
// term and down-payment sliders (Spine step 2), and the item's history so far.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetHistoryPanel } from '@/components/asset-history-panel';
import { PriceCalculator } from '@/components/price-calculator';
import { StatusBadge } from '@/components/status-badge';
import { loadCoefficientTable, loadCustomers, loadPriceLists } from '@/data/load';
import { effectiveVatRates } from '@/server/vat';
import { catalogueSearchString, parseCatalogueQuery } from '@/domain/catalogue';
import { formatEuro } from '@/domain/money';
import { listPriceOn, nextPriceChange } from '@/domain/price-list';
import { parsePriceSelection } from '@/domain/price-selection';
import { vatPercentOn } from '@/domain/vat';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getAsset, getAssetExtras } from '@/server/assets';
import { listContractsForAsset } from '@/server/contracts';
import { listRefurbishments } from '@/server/second-life';
import { assetTimeline } from '@/domain/asset-timeline';
import { currentViewer } from '@/server/current-viewer';
import { viewerCustomerId } from '@/server/viewer';
import { canBeLeasedBy } from '@/domain/availability';
import { db } from '@/server/db';
import { appDate } from '@/server/app-date';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/assets/[id]'>): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const asset = await getAsset(db, id);
  if (!asset) return {};
  return { title: `${asset.make} ${asset.model} – ${getT(locale)('brand.name')}` };
}

export default async function AssetPage({
  params,
  searchParams,
}: PageProps<'/[locale]/assets/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  // The catalogue passes its filters along (?q=&category=…). They survive a language switch,
  // so "Back to catalogue" returns to the same search in the language you are using now.
  const search = await searchParams;
  const backHref = `/${locale}${catalogueSearchString(parseCatalogueQuery(search))}`;

  // Render on every request: the price depends on today's date and the item on the database.
  await connection();

  const [asset, priceLists, table, vatRates] = await Promise.all([
    getAsset(db, id),
    loadPriceLists(),
    loadCoefficientTable(),
    effectiveVatRates(db),
  ]);
  if (!asset) notFound();

  const t = getT(locale);
  const [{ today }, viewer, extras, customers, contracts, refurbishments] = await Promise.all([
    appDate(),
    currentViewer(),
    getAssetExtras(db, asset.id),
    loadCustomers(),
    listContractsForAsset(db, asset.id),
    listRefurbishments(db, asset.id),
  ]);
  // The passport: the data pack's counted lives, then our own leases and refurbishments.
  const timeline = assetTimeline(
    asset,
    contracts.map((c) => ({
      startDate: c.startDate,
      endDate: c.endDate,
      status: c.status,
      customerName: c.customerName,
      closedDate: c.boughtDate ?? c.returnedDate,
    })),
    refurbishments.map((r) => ({
      date: r.date,
      conditionBefore: r.conditionBefore,
      conditionAfter: r.conditionAfter,
      priceCents: r.priceCents,
    })),
    today
  );
  const reservedFor = extras?.reservedFor ?? null;
  const heldForName = customers.find((c) => c.id === reservedFor)?.name ?? null;
  // Available to anyone, or reserved for the viewer (an item passed on to them).
  const leasable = canBeLeasedBy({ status: asset.status, reservedFor }, viewerCustomerId(viewer));
  const price = listPriceOn(priceLists, asset.id, today);
  const change = nextPriceChange(priceLists, asset.id, today);
  const vatPercent = vatPercentOn(vatRates, today);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);

  const facts: [string, string][] = [
    [t('asset.category'), t(`category.${asset.category}`)],
    [t('asset.modelYear'), String(asset.model_year)],
    [t('asset.serialNumber'), asset.serial_number],
    [t('asset.id'), asset.id],
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
      >
        <span aria-hidden="true">&larr;</span>
        {t('asset.backToCatalogue')}
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-stone-600 dark:text-stone-400">{asset.make}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{asset.model}</h1>
        </div>
        <StatusBadge status={asset.status} t={t} />
      </div>

      {asset.status !== 'available' ? (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {leasable
            ? t('asset.statusNote.reservedForYou')
            : heldForName
              ? t('asset.statusNote.heldFor', { name: heldForName })
              : t(`asset.statusNote.${asset.status}`)}
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 md:grid-cols-[3fr_2fr]">
        <section
          aria-labelledby="details-heading"
          className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
        >
          <h2 id="details-heading" className="text-lg font-semibold">
            {t('asset.details')}
          </h2>
          <dl className="mt-4 divide-y divide-stone-100 text-sm dark:divide-stone-800">
            {facts.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2.5">
                <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          aria-labelledby="price-heading"
          className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
        >
          <h2 id="price-heading" className="text-lg font-semibold">
            {t('asset.listPrice')}
          </h2>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {price.ok ? euro(price.priceCents) : t('asset.noPrice')}
          </p>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            <time dateTime={today}>
              {t('catalogue.pricesOn', { date: formatIsoDate(today, locale) })}
            </time>
            {price.ok ? (
              <> · {t('asset.priceListVersion', { version: price.priceListVersion })}</>
            ) : null}
          </p>
          {change ? (
            <p className="mt-4 rounded-lg bg-stone-100 p-3 text-sm text-stone-800 dark:bg-stone-800 dark:text-stone-200">
              {t('asset.nextPrice', {
                date: formatIsoDate(change.validFrom, locale),
                price: euro(change.priceCents),
              })}
            </p>
          ) : null}
        </section>
      </div>

      {/* Only an available item with a price can be quoted; the status note explains the rest. */}
      {leasable && price.ok && vatPercent !== null ? (
        <PriceCalculator
          assetId={asset.id}
          listPriceCents={price.priceCents}
          vatPercent={vatPercent}
          table={table}
          initial={parsePriceSelection(search, price.priceCents, table)}
          locale={locale}
        />
      ) : null}

      <AssetHistoryPanel asset={asset} entries={timeline} today={today} locale={locale} t={t} />
    </div>
  );
}
