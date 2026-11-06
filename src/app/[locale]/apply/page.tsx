// The application page (Spine step 3): /fi/apply?asset=ebike-003&term=36&down=0
// `down` is the net down payment in cents, the same unit the contract configurator uses.
// The page prices the lease with the contract quote and passes the rent incl. VAT to the form,
// which asks the questions and shows the decision. Colours are the design tokens from AGENTS.md.
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { connection } from 'next/server';
import { z } from 'zod';
import { ApplicationForm, type ApplicationDeal } from '@/components/application-form';
import { ChangeTermsDialog } from '@/components/change-terms-dialog';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { calculateContractQuote } from '@/domain/contract-pricing';
import { calculateQuoteWithOffer, remainingOfferDays } from '@/domain/offer';
import { formatEuro } from '@/domain/money';
import { listPriceOn } from '@/domain/price-list';
import { formatIsoDate } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { intlLocale, isLocale, type Locale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { getActiveReservation } from '@/server/reservations';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

const querySchema = z.object({
  asset: z.string().min(1),
  term: z.coerce.number().int().positive(),
  down: z.coerce.number().int().min(0).default(0),
  token: z.string().optional(),
});

export default async function ApplyPage({ params, searchParams }: PageProps<'/[locale]/apply'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection(); // prices depend on today's date and on the database

  const t = getT(locale);
  const query = querySchema.safeParse(await searchParams);
  if (!query.success) return <Message text={t('apply.invalidDeal')} />;

  const { asset: assetId, term, down, token } = query.data;
  const today = todayIso();

  // Check and expire any overdue reservation before listing assets so status is never stale
  const activeReservation = await getActiveReservation(db, assetId);

  const [assets, priceLists, coefficientTable, vatRates] = await Promise.all([
    listAssets(db),
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) return <Message text={t('apply.notFound')} />;

  if (asset.status === 'reserved') {
    const isTokenHolder = Boolean(token && activeReservation && activeReservation.token === token);
    if (!isTokenHolder) {
      return (
        <Message
          text={activeReservation ? t('apply.reservation.conflict') : t('apply.unavailable')}
        />
      );
    }
  } else if (asset.status !== 'available') {
    return <Message text={t('apply.unavailable')} />;
  }
  const price = listPriceOn(priceLists, asset.id, today);
  if (!price.ok) return <Message text={t('asset.noPrice')} />;

  const isOffer = activeReservation?.reservationType === 'offer';
  const offerEval =
    isOffer && activeReservation && activeReservation.listPriceCents !== undefined
      ? calculateQuoteWithOffer({
          offerTerms: {
            listPriceCents: activeReservation.listPriceCents,
            priceListVersion: activeReservation.priceListVersion ?? 1,
            termMonths: term,
            downPaymentCents: down,
            monthlyNetRentCents: activeReservation.monthlyNetRentCents ?? 0,
            monthlyGrossRentCents: activeReservation.monthlyGrossRentCents ?? 0,
            buyoutNetCents: activeReservation.buyoutNetCents ?? 0,
            offeredOn: activeReservation.offeredOn ?? today,
          },
          currentListPriceCents: price.priceCents,
          currentPriceListVersion: price.priceListVersion,
          asOfDate: today,
          expiresAt: activeReservation.expiresAt,
          coefficientTable,
          vatRates,
        })
      : null;

  const protection = offerEval?.protection ?? null;
  const priceIncreased = protection?.status === 'price_protected';
  const effectiveListPriceCents = protection
    ? protection.effectiveListPriceCents
    : price.priceCents;
  const effectivePriceListVersion = protection
    ? protection.effectivePriceListVersion
    : price.priceListVersion;

  const result = offerEval
    ? offerEval.quoteResult
    : calculateContractQuote({
        listPriceCents: effectiveListPriceCents,
        priceListVersion: effectivePriceListVersion,
        downPaymentCents: down,
        termMonths: term,
        isoDate: today,
        coefficientTable,
        vatRates,
      });

  const priceDiffCents = protection?.savingsCents ?? 0;
  const monthlyDiffCents = offerEval?.monthlyNetRentSavingsCents ?? 0;
  // Amounts outside what can be financed still open the form: the decision explains why.
  const quote = result.ok ? result.quote : null;
  if (
    !result.ok &&
    (result.reason === 'invalid_down_payment' || result.reason === 'no_vat_rate_on_date')
  ) {
    return <Message text={t('apply.invalidDeal')} />;
  }
  const financed = quote ? quote.financedCents : effectiveListPriceCents - down;

  const deal: ApplicationDeal = {
    category: asset.category,
    financed_amount_cents: financed,
    term_months: term,
    ...(quote ? { monthly_rent_incl_vat_cents: quote.monthlyGrossRentCents } : {}),
  };

  const rows: [string, string][] = [
    [t('apply.deal.item'), `${asset.make} ${asset.model}`],
    [t('apply.deal.term'), t('apply.deal.termValue', { months: term })],
    [
      t('apply.deal.listPrice'),
      priceIncreased
        ? `${money(effectiveListPriceCents, locale)} (v${effectivePriceListVersion})`
        : money(price.priceCents, locale),
    ],
    ...(priceIncreased
      ? ([[t('apply.offer.priceProtectedTitle'), `-${money(priceDiffCents, locale)}`]] as [
          string,
          string,
        ][])
      : []),
    [t('apply.deal.downPayment'), money(down, locale)],
    [t('apply.deal.financed'), money(financed, locale)],
    ...(quote
      ? ([
          [t('apply.deal.monthlyNetRent'), money(quote.monthlyNetRentCents, locale)],
          [t('apply.deal.monthlyGrossRent'), money(quote.monthlyGrossRentCents, locale)],
        ] as [string, string][])
      : []),
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 text-[#353331] sm:px-6 sm:py-14 dark:text-stone-100">
      <div className="max-w-2xl">
        <h1 className="text-[2.25rem] leading-tight font-bold">{t('apply.title')}</h1>
        <p className="mt-[12px] text-[1.125rem] text-[#615b57] dark:text-stone-400">
          {t('apply.intro')}
        </p>
      </div>
      <div className="mt-[32px]">
        {priceIncreased && activeReservation ? (
          <div
            role="status"
            className="mb-[24px] rounded-[8px] border border-[#2ed167] bg-[#f7f8f7] p-[16px] text-[#14522a] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            <div className="flex items-center gap-[8px]">
              <svg
                aria-hidden="true"
                className="size-5 shrink-0 text-[#16A34A]"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="font-bold">{t('apply.offer.priceProtectedTitle')}</span>
            </div>
            <p className="mt-[4px] text-[0.875rem]">
              {t('apply.offer.priceProtectedDesc', {
                offeredPrice: money(activeReservation.listPriceCents ?? 0, locale),
                currentPrice: money(price.priceCents, locale),
                currentVersion: price.priceListVersion,
                offeredVersion: activeReservation.priceListVersion ?? 1,
                diff: money(priceDiffCents, locale),
                monthlyDiff: money(monthlyDiffCents, locale),
              })}
            </p>
          </div>
        ) : isOffer && activeReservation ? (
          <div
            role="status"
            className="mb-[24px] rounded-[8px] border border-[#ccd7e6] bg-[#f6f7f8] p-[16px] text-[#123054] dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
          >
            <span className="font-bold">{t('apply.offer.bannerTitle')}</span>
            <p className="mt-[4px] text-[0.875rem]">
              {t('apply.offer.bannerDesc', {
                offeredOn: activeReservation.offeredOn ?? today,
                expiresAt: formatIsoDate(activeReservation.expiresAt.slice(0, 10), locale),
                days: remainingOfferDays(activeReservation.expiresAt, today),
              })}
            </p>
          </div>
        ) : null}
        <ApplicationForm
          locale={locale}
          deal={deal}
          initialToken={token}
          initialReservationType={isOffer ? 'offer' : 'standard'}
          signTarget={
            quote
              ? {
                  assetId: asset.id,
                  termMonths: term,
                  downPaymentCents: down,
                  signedOn: today,
                  offeredOn: isOffer ? activeReservation?.offeredOn : undefined,
                }
              : undefined
          }
        >
          <DealSummary t={t} rows={rows}>
            <ChangeTermsDialog
              asset={asset}
              price={price}
              coefficientTable={coefficientTable}
              vatRates={vatRates}
              isoDate={today}
              locale={locale}
              termMonths={term}
              downPaymentCents={down}
            />
          </DealSummary>
        </ApplicationForm>
      </div>
    </div>
  );
}

const money = (cents: number, locale: Locale) => formatEuro(cents, intlLocale[locale]);

function DealSummary({
  t,
  rows,
  children,
}: {
  t: Translate;
  rows: [string, string][];
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby="deal-heading"
      className="rounded-[12px] border border-[#dad9d8] bg-[#FFFFFF] p-[24px] text-[#353331] shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100"
    >
      <h2 id="deal-heading" className="text-[1.375rem] leading-tight font-bold">
        {t('apply.deal.heading')}
      </h2>
      <dl className="mt-[12px] space-y-[8px] text-[0.875rem]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-[16px]">
            <dt className="text-[#615b57] dark:text-stone-400">{label}</dt>
            <dd className="text-right font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}

function Message({ text }: { text: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="rounded-[12px] border border-[#e9dac8] bg-[#f8f7f6] p-[24px] text-[#5c360a] dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        {text}
      </p>
    </div>
  );
}
