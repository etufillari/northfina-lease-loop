// One item in detail: everything we know about it and today's net list price.
// The monthly price with term and down-payment sliders (Spine step 2) will live here too.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { StatusBadge } from '@/components/status-badge';
import { loadPriceLists } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { listPriceOn, nextPriceChange } from '@/domain/price-list';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getAsset } from '@/server/assets';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/assets/[id]'>): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const asset = await getAsset(db, id);
  if (!asset) return {};
  return { title: `${asset.make} ${asset.model} – ${getT(locale)('brand.name')}` };
}

export default async function AssetPage({ params }: PageProps<'/[locale]/assets/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: the price depends on today's date and the item on the database.
  await connection();

  const [asset, priceLists] = await Promise.all([getAsset(db, id), loadPriceLists()]);
  if (!asset) notFound();

  const t = getT(locale);
  const today = todayIso();
  const price = listPriceOn(priceLists, asset.id, today);
  const change = nextPriceChange(priceLists, asset.id, today);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);

  const facts: [string, string][] = [
    [t('asset.category'), t(`category.${asset.category}`)],
    [t('condition.label'), t(`condition.${asset.condition}`)],
    [t('asset.modelYear'), String(asset.model_year)],
    [
      t('asset.usage'),
      t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) }),
    ],
    [t('asset.previousLives'), formatNumber(asset.previous_lives, locale)],
    [t('asset.serialNumber'), asset.serial_number],
    [t('asset.id'), asset.id],
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`/${locale}`}
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
          {t(`asset.statusNote.${asset.status}`)}
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
    </div>
  );
}
