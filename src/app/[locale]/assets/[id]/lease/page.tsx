import { assetBusinessDate } from '@/server/circular/queries';
import { loadCataloguePriceLists } from '@/server/circular/prices';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { formatEuro } from '@/domain/money';
import { listPriceOn } from '@/domain/price-list';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export default async function StartLeasingPage({
  params,
}: PageProps<'/[locale]/assets/[id]/lease'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();

  await connection();
  const t = getT(locale);
  const today = await assetBusinessDate(db, id, todayIso());
  const [assets, priceLists] = await Promise.all([listAssets(db), loadCataloguePriceLists(db)]);
  const asset = assets.find((item) => item.id === id);
  if (!asset) notFound();

  const price = listPriceOn(priceLists, asset.id, today);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`/${locale}/assets/${asset.id}`}
        className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
      >
        {t('assetDetails.backToDetails')}
      </Link>
      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
        <p className="text-sm text-stone-600 dark:text-stone-400">{asset.make}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{asset.model}</h1>
        <p className="mt-4 text-lg text-stone-700 dark:text-stone-300">
          {t('assetDetails.leaseIntro')}
        </p>
        {price.ok ? (
          <p className="mt-6 text-xl font-semibold tabular-nums">
            {formatEuro(price.priceCents, intlLocale[locale])}{' '}
            <span className="text-sm font-normal text-stone-600 dark:text-stone-400">
              {t('asset.listPrice')}
            </span>
          </p>
        ) : null}
        <p className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {t('assetDetails.leaseNextStep')}
        </p>
      </section>
    </div>
  );
}
