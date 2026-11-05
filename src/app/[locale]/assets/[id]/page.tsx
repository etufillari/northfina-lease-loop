import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { loadPriceLists } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { listPriceOn } from '@/domain/price-list';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

const statusStyles = {
  available:
    'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
  reserved:
    'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
  returned:
    'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800',
} as const;

export default async function AssetDetailsPage({ params }: PageProps<'/[locale]/assets/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();

  await connection();
  const t = getT(locale);
  const today = todayIso();
  const [assets, priceLists] = await Promise.all([listAssets(db), loadPriceLists()]);
  const asset = assets.find((item) => item.id === id);
  if (!asset) notFound();

  const price = listPriceOn(priceLists, asset.id, today);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`/${locale}`}
        className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
      >
        {t('assetDetails.backToCatalogue')}
      </Link>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-stone-600 dark:text-stone-400">{asset.make}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
                {asset.model}
              </h1>
              <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{asset.id}</p>
            </div>
            <p
              className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${statusStyles[asset.status]}`}
            >
              {t(`status.${asset.status}`)}
            </p>
          </div>

          <dl className="mt-8 grid gap-6 border-t border-stone-200 pt-6 sm:grid-cols-2 dark:border-stone-800">
            <Fact label={t('condition.label')} value={t(`condition.${asset.condition}`)} />
            <Fact label={t('asset.modelYear')} value={String(asset.model_year)} />
            <Fact
              label={t('asset.usage')}
              value={t(`usage.${asset.usage.unit}`, {
                value: formatNumber(asset.usage.value, locale),
              })}
            />
            <Fact
              label={t('asset.previousLives')}
              value={formatNumber(asset.previous_lives, locale)}
            />
            <Fact label={t('asset.serialNumber')} value={asset.serial_number} />
          </dl>
        </section>

        <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <p className="text-sm text-stone-600 dark:text-stone-400">{t('asset.listPrice')}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {price.ok ? formatEuro(price.priceCents, intlLocale[locale]) : t('asset.noPrice')}
          </p>
          {price.ok ? (
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              {t('asset.priceListVersion', { version: price.priceListVersion })}
            </p>
          ) : null}
          <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
            {t('catalogue.pricesOn', { date: formatIsoDate(today, locale) })}
          </p>
          <Link
            href={`/${locale}/assets/${asset.id}/lease`}
            className="mt-6 block w-full rounded-lg bg-emerald-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          >
            {t('assetDetails.startLeasing')}
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
