// Fleet leasing: a company picks several items, answers the questions once and signs once.
// The rules are in src/domain/fleet.ts; the server decides again when the fleet is sent.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { FleetBuilder, type FleetItem } from '@/components/fleet-builder';
import { loadCoefficientTable, loadQuestions } from '@/data/load';
import { canBeLeasedBy } from '@/domain/availability';
import { prefillAnswers } from '@/domain/prefill';
import { listPriceOn } from '@/domain/price-list';
import { leaseTerms } from '@/domain/pricing';
import { vatPercentOn } from '@/domain/vat';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { appDate } from '@/server/app-date';
import { assetsOn } from '@/server/asset-state';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { effectivePriceLists } from '@/server/second-life';
import { effectiveVatRates } from '@/server/vat';
import { viewerCustomerId } from '@/server/viewer';

export default async function FleetPage({ params }: PageProps<'/[locale]/fleet'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const [{ today }, viewer] = await Promise.all([appDate(), currentViewer()]);
  const [assets, priceLists, table, vatRates, questionsFile] = await Promise.all([
    assetsOn(db, today),
    effectivePriceLists(db, today),
    loadCoefficientTable(),
    effectiveVatRates(db),
    loadQuestions(),
  ]);
  const customerId = viewerCustomerId(viewer);
  // What this viewer could lease today, one by one, with today's price.
  const items: FleetItem[] = assets.flatMap(({ asset, reservedFor, laterHistory }) => {
    if (laterHistory) return [];
    if (!canBeLeasedBy({ status: asset.status, reservedFor }, customerId)) return [];
    const price = listPriceOn(priceLists, asset.id, today);
    if (!price.ok) return [];
    return [
      {
        id: asset.id,
        category: asset.category,
        name: `${asset.make} ${asset.model}`,
        condition: asset.condition,
        listPriceCents: price.priceCents,
      },
    ];
  });
  const vatPercent = vatPercentOn(vatRates, today);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('fleet.title')}</h1>
      <p className="mt-3 max-w-3xl text-lg text-stone-700 dark:text-stone-300">
        {t('fleet.intro')}
      </p>
      <div className="mt-8">
        {vatPercent === null || items.length === 0 ? (
          <p className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
            {t('fleet.nothing')}
          </p>
        ) : (
          <FleetBuilder
            items={items}
            table={table}
            vatPercent={vatPercent}
            terms={leaseTerms(table)}
            questions={questionsFile.questions}
            initialAnswers={viewer.kind === 'customer' ? prefillAnswers(viewer.customer) : {}}
            viewerKey={viewer.kind === 'customer' ? viewer.customer.id : viewer.kind}
            today={today}
            locale={locale}
          />
        )}
      </div>
    </div>
  );
}
