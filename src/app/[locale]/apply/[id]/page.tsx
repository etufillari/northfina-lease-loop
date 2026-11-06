// Spine step 3: the application. The wizard itself is a client component; this shell
// provides the persona and the as-of date (the time-travel control or ?asOf=), and a link
// back to what is being applied for: the item, or the fleet page for a group of items. An
// application is shown only to the customer it belongs to — it holds their personal answers.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ApplicationWizard } from '@/components/application-wizard';
import { BackLink } from '@/components/back-to-catalogue';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { loadVatRates } from '@/data/load';
import { pricesIncludeVat, vatRateOn } from '@/domain/vat';
import { asOfFromPage } from '@/server/as-of';
import { db } from '@/server/db';
import { quoteAssetIds } from '@/server/quotes';
import { currentUser } from '@/server/current-user';

export default async function ApplyPage({
  params,
  searchParams,
}: PageProps<'/[locale]/apply/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);
  const { asOf, asOfParam } = await asOfFromPage(await searchParams);
  const persona = (await currentUser())?.customerId ?? null;
  const application = await db.application.findUnique({
    where: { id },
    include: { quote: true },
  });
  if (!application) notFound();

  if (application.customer_id !== persona) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold">{t('apply.title')}</h1>
        <p className="mt-6 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('apply.notYours')}
        </p>
      </div>
    );
  }

  const customer = await db.customer.findUnique({
    where: { id: application.customer_id },
    select: { type: true },
  });
  const vat = vatRateOn(await loadVatRates(), asOf);
  const assetIds = quoteAssetIds(application.quote);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {assetIds.length === 1 ? (
        <BackLink
          path={`/${locale}/assets/${assetIds[0]}`}
          label={t('apply.backToItem')}
          asOfParam={asOfParam}
        />
      ) : assetIds.length > 1 ? (
        <BackLink path={`/${locale}/fleet`} label={t('apply.backToFleet')} asOfParam={asOfParam} />
      ) : null}
      <div className={assetIds.length > 0 ? 'mt-3' : undefined}>
        <ApplicationWizard
          locale={locale}
          applicationId={id}
          personaId={persona}
          asOf={asOf}
          today={asOf}
          pricesInclVat={pricesIncludeVat(customer?.type)}
          vatRate={
            vat.ok ? { ratePercent: vat.ratePercent, rateBasisPoints: vat.rateBasisPoints } : null
          }
        />
      </div>
    </div>
  );
}
