// One item: the live lease price with sliders, and signing. Items that can't be leased today
// still show, with the reason.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { LeaseCalculator } from '@/components/lease-calculator';
import { CategoryArt } from '@/components/ui/category-art';
import { LivesMeter } from '@/components/ui/lives-meter';
import { StatusBadge } from '@/components/ui/status-badge';
import { answersFromCustomer } from '@/domain/persona';
import { listPriceOn } from '@/domain/price-list';
import { downPaymentBounds } from '@/domain/pricing';
import { vatRateOn } from '@/domain/vat';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { toAsset } from '@/server/assets';
import { db } from '@/server/db';
import { loadLeaseDataPack } from '@/server/lease-data';
import { asOfDate } from '@/server/as-of';

export default async function AssetPage({ params }: PageProps<'/[locale]/assets/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const row = await db.asset.findUnique({ where: { id } });
  if (!row) notFound();
  const asset = toAsset(row);
  const t = getT(locale);
  const today = await asOfDate();
  const data = await loadLeaseDataPack();

  const price = listPriceOn(data.priceLists, asset.id, today);
  const bounds = price.ok ? downPaymentBounds(data.coefficientTable, price.priceCents) : null;
  const vat = vatRateOn(data.vatRates, today);

  let blocked: MessageKey | null = null;
  if (asset.status !== 'available') blocked = `lease.notLeasable.${asset.status}`;
  else if (!price.ok || !vat.ok) blocked = 'lease.notLeasable.no_price';
  else if (!bounds?.ok) blocked = 'lease.notLeasable.below_minimum';

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href={`/${locale}`}
        className="inline-flex items-center gap-2 rounded-full text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        <span aria-hidden="true">←</span> {t('lease.back')}
      </Link>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end">
        <CategoryArt category={asset.category} className="aspect-[16/10] rounded-lg">
          <div className="absolute inset-x-3 top-3 flex flex-wrap justify-between gap-2">
            <StatusBadge status={asset.status} t={t} />
            <LivesMeter previousLives={asset.previous_lives} t={t} />
          </div>
        </CategoryArt>
        <div className="flex flex-col gap-4">
          <div>
            <p className="eyebrow">
              {t(`category.${asset.category}`)} · {asset.make}
            </p>
            <h1 className="mt-2 font-display text-3xl leading-tight font-extrabold tracking-tight text-balance uppercase sm:text-4xl">
              {t('lease.title', { name: asset.model })}
            </h1>
            <p className="mt-2 text-sm text-muted">
              <time dateTime={today}>
                {t('lease.today', { date: formatIsoDate(today, locale) })}
              </time>
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-2">
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
          </dl>
        </div>
      </div>

      <div className="mt-10 border-t border-line pt-10">
        {blocked !== null || !price.ok || !vat.ok || !bounds?.ok ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-muted">
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
