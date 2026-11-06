// Admin, Second life: the workbench for one returned item, with its passport below.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetHistoryPanel } from '@/components/asset-history-panel';
import { SecondLifeWorkbench } from '@/components/second-life-workbench';
import { StatusBadge } from '@/components/status-badge';
import {
  loadCoefficientTable,
  loadCustomers,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';
import { assetTimeline } from '@/domain/asset-timeline';
import { ageInMonths } from '@/domain/second-life';
import { vatPercentOn } from '@/domain/vat';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { appDate } from '@/server/app-date';
import { assetOn } from '@/server/asset-state';
import { TimeTravelNotice } from '@/components/time-travel-notice';
import { contractOn } from '@/domain/state-on';
import { listContractsForAsset } from '@/server/contracts';
import { db } from '@/server/db';
import { listRefurbishments, originalListPrice } from '@/server/second-life';
import { effectiveVatRates } from '@/server/vat';

export default async function WorkbenchPage({
  params,
}: PageProps<'/[locale]/admin/second-life/[assetId]'>) {
  const { locale, assetId } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const { today } = await appDate();
  // As it was on the app's date; while it has later history it can only be looked at.
  const item = await assetOn(db, assetId, today);
  if (!item) notFound();
  const asset = item.asset;
  const [original, curves, costs, demand, table, vatRates, customers, contracts, refurbishments] =
    await Promise.all([
      originalListPrice(asset.id),
      loadResidualCurves(),
      loadRefurbishmentCosts(),
      loadSecondLifeDemand(),
      loadCoefficientTable(),
      effectiveVatRates(db),
      loadCustomers(),
      listContractsForAsset(db, asset.id),
      listRefurbishments(db, asset.id),
    ]);
  const vatPercent = vatPercentOn(vatRates, today);
  const timeline = assetTimeline(
    asset,
    contracts
      .flatMap((c) => contractOn(c, today) ?? [])
      .map((c) => ({
        startDate: c.startDate,
        endDate: c.endDate,
        status: c.status,
        customerName: c.customerName,
        closedDate: c.boughtDate ?? c.returnedDate,
      })),
    refurbishments
      .filter((r) => r.date <= today)
      .map((r) => ({
        date: r.date,
        conditionBefore: r.conditionBefore,
        conditionAfter: r.conditionAfter,
        priceCents: r.priceCents,
      })),
    today
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`/${locale}/admin/second-life`}
        className="text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400"
      >
        ← {t('secondLife.title')}
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-stone-600 dark:text-stone-400">{asset.make}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{asset.model}</h1>
          <p className="mt-1 font-mono text-sm text-stone-600 dark:text-stone-400">
            {asset.id} · {asset.serial_number}
          </p>
        </div>
        <StatusBadge status={asset.status} t={t} />
      </div>

      <div className="mt-8">
        {item.laterHistory ? (
          <TimeTravelNotice text={t('timeTravel.lockedItem')} locale={locale} t={t} />
        ) : asset.status === 'returned' && original !== null && vatPercent !== null ? (
          <SecondLifeWorkbench
            asset={asset}
            originalNetCents={original}
            ageMonths={ageInMonths(asset.model_year, today)}
            curves={curves}
            costs={costs}
            demand={demand}
            table={table}
            vatPercent={vatPercent}
            today={today}
            heldForName={customers.find((c) => c.id === item.reservedFor)?.name ?? null}
            locale={locale}
          />
        ) : (
          <p className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
            {t('secondLife.notReturned')}
          </p>
        )}
      </div>

      <AssetHistoryPanel asset={asset} entries={timeline} today={today} locale={locale} t={t} />
    </div>
  );
}
