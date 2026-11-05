// One item: the live lease price with sliders, and signing. Items that can't be leased today
// still show, with the reason.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { LeaseCalculator } from '@/components/lease-calculator';
import { answersFromCustomer } from '@/domain/persona';
import { listPriceOn } from '@/domain/price-list';
import { downPaymentBounds } from '@/domain/pricing';
import { vatRateOn } from '@/domain/vat';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { toAsset } from '@/server/assets';
import { db } from '@/server/db';
import { loadLeaseDataPack } from '@/server/lease-data';
import { todayIso } from '@/server/today';

export default async function AssetPage({ params }: PageProps<'/[locale]/assets/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const row = await db.asset.findUnique({ where: { id } });
  if (!row) notFound();
  const asset = toAsset(row);
  const t = getT(locale);
  const today = todayIso();
  const data = await loadLeaseDataPack();

  const price = listPriceOn(data.priceLists, asset.id, today);
  const bounds = price.ok ? downPaymentBounds(data.coefficientTable, price.priceCents) : null;
  const vat = vatRateOn(data.vatRates, today);

  let blocked: MessageKey | null = null;
  if (asset.status !== 'available') blocked = `lease.notLeasable.${asset.status}`;
  else if (!price.ok || !vat.ok) blocked = 'lease.notLeasable.no_price';
  else if (!bounds?.ok) blocked = 'lease.notLeasable.below_minimum';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link
        href={`/${locale}`}
        className="text-sm text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300"
      >
        ← {t('lease.back')}
      </Link>
      <p className="mt-6 text-sm text-stone-600 dark:text-stone-400">{asset.make}</p>
      <h1 className="text-3xl font-semibold tracking-tight">
        {t('lease.title', { name: asset.model })}
      </h1>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
        <time dateTime={today}>{t('lease.today', { date: formatIsoDate(today, locale) })}</time>
      </p>

      <div className="mt-8">
        {blocked !== null || !price.ok || !vat.ok || !bounds?.ok ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 dark:border-stone-700">
            {t(blocked ?? 'lease.notLeasable.no_price')}
          </p>
        ) : (
          <LeaseCalculator
            locale={locale}
            assetId={asset.id}
            listPriceCents={price.priceCents}
            priceListVersion={price.priceListVersion}
            table={data.coefficientTable}
            bounds={bounds}
            vatRatePercent={vat.ratePercent}
            category={asset.category}
            questions={data.questions}
            personas={data.customers.map((c) => ({
              id: c.id,
              name: c.name,
              answers: answersFromCustomer(c),
            }))}
            vatRates={data.vatRates}
            today={today}
          />
        )}
      </div>
    </div>
  );
}
