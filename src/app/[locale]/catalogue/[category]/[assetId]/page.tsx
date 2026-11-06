// One item: choose a term and a down payment and see the monthly price update live.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { CustomerApplicationFlow } from '@/components/customer-application-flow';
import { assetCategorySchema } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getAsset } from '@/server/assets/assets';
import { listCustomers } from '@/server/assets/customers';
import { db } from '@/server/db';
import { createLeaseOffer, type LeaseOfferResult } from '@/server/quotes/lease-offer';
import { todayIso } from '@/server/today';

function offerFailureMessage(
  offer: Extract<LeaseOfferResult, { ok: false }>,
  t: Translate
): string {
  if (offer.reason === 'asset_unavailable') return t('lease.unavailable');
  if (offer.reason === 'below_minimum') return t('lease.belowMinimum');
  return t('lease.noQuote');
}

export default async function AssetLeasePage({
  params,
}: PageProps<'/[locale]/catalogue/[category]/[assetId]'>) {
  const { locale, category: categoryParam, assetId } = await params;
  if (!isLocale(locale)) notFound();

  const categoryResult = assetCategorySchema.safeParse(categoryParam);
  if (!categoryResult.success) notFound();
  const category = categoryResult.data;

  // Render on every request: the offer depends on today's date and on the database.
  await connection();

  const asset = await getAsset(db, assetId);
  if (!asset || asset.category !== category) notFound();

  const t = getT(locale);
  const today = todayIso(); // the page decides what "today" is; domain code never reads the clock
  const [offer, customers] = await Promise.all([
    createLeaseOffer(db, asset.id, today),
    listCustomers(db),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`/${locale}/catalogue/${category}`}
        className="text-sm font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300"
      >
        {t('lease.back', { category: t(`category.${category}`) })}
      </Link>

      <p className="mt-6 text-sm text-stone-600 dark:text-stone-400">{asset.make}</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{asset.model}</h1>

      {offer.ok ? (
        <>
          <p className="mt-5 mb-6 text-sm text-stone-600 dark:text-stone-400">
            {t('asset.listPrice')}:{' '}
            {formatEuro(offer.quote.pricing.netListPriceCents, intlLocale[locale])}
            {' · '}
            <time dateTime={today}>{formatIsoDate(today, locale)}</time>
          </p>
          <h2 className="mb-4 text-xl font-semibold">{t('lease.title')}</h2>
          <CustomerApplicationFlow
            assetId={asset.id}
            date={today}
            limits={offer.limits}
            initialQuote={offer.quote}
            locale={locale}
            calculatorLabels={{
              downPayment: t('catalogue.downPayment'),
              termLength: t('catalogue.termLength'),
              months: t('catalogue.months'),
              monthlyWithVat: t('lease.monthlyWithVat'),
              monthlyNet: t('lease.monthlyNet'),
              vat: t('lease.vat'),
              financed: t('lease.financed'),
              buyout: t('lease.buyout'),
              totalCost: t('lease.totalCost'),
              bandNote: t('lease.bandNote'),
              unavailable: t('lease.unavailable'),
              updateFailed: t('lease.updateFailed'),
              continueToApplication: t('lease.startApplication'),
            }}
            labels={{
              eyebrow: t('application.flow.eyebrow'),
              title: t('application.flow.title'),
              intro: t('application.flow.intro'),
              applicant: t('application.flow.applicant'),
              applicantHint: t('application.flow.applicantHint'),
              questionnaire: t('application.flow.questionnaire'),
              questionCount: t('application.flow.questionCount'),
              whyWeAsk: t('application.flow.whyWeAsk'),
              next: t('application.flow.next'),
              back: t('application.flow.back'),
              submit: t('application.flow.submit'),
              submitting: t('application.flow.submitting'),
              loading: t('application.flow.loading'),
              previewFailed: t('application.flow.previewFailed'),
              submitFailed: t('application.flow.submitFailed'),
              answerRequired: t('application.flow.answerRequired'),
              moneyHint: t('application.flow.moneyHint'),
              listHint: t('application.flow.listHint'),
              ready: t('application.flow.ready'),
              readyBody: t('application.flow.readyBody'),
              manualReview: t('application.flow.manualReview'),
              rejected: t('application.flow.rejected'),
              decisionBody: t('application.flow.decisionBody'),
              decisionReasons: t('application.flow.decisionReasons'),
              backToQuote: t('application.flow.backToQuote'),
              noApplicant: t('application.flow.noApplicant'),
            }}
            customerOptions={customers.map(({ id, name, type }) => ({ id, name, type }))}
          />
        </>
      ) : (
        <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {offerFailureMessage(offer, t)}
        </p>
      )}
    </div>
  );
}
