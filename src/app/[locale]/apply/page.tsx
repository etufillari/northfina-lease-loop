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
import { formatEuro } from '@/domain/money';
import { listPriceOn } from '@/domain/price-list';
import { getT, type Translate } from '@/i18n/get-t';
import { intlLocale, isLocale, type Locale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

const querySchema = z.object({
  asset: z.string().min(1),
  term: z.coerce.number().int().positive(),
  down: z.coerce.number().int().min(0).default(0),
});

export default async function ApplyPage({ params, searchParams }: PageProps<'/[locale]/apply'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection(); // prices depend on today's date and on the database

  const t = getT(locale);
  const query = querySchema.safeParse(await searchParams);
  if (!query.success) return <Message text={t('apply.invalidDeal')} />;

  const { asset: assetId, term, down } = query.data;
  const today = todayIso();
  const [assets, priceLists, coefficientTable, vatRates] = await Promise.all([
    listAssets(db),
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) return <Message text={t('apply.notFound')} />;
  if (asset.status !== 'available') return <Message text={t('apply.unavailable')} />;

  const price = listPriceOn(priceLists, asset.id, today);
  if (!price.ok) return <Message text={t('asset.noPrice')} />;

  const result = calculateContractQuote({
    listPriceCents: price.priceCents,
    priceListVersion: price.priceListVersion,
    downPaymentCents: down,
    termMonths: term,
    isoDate: today,
    coefficientTable,
    vatRates,
  });

  // Amounts outside what can be financed still open the form: the decision explains why.
  const quote = result.ok ? result.quote : null;
  if (
    !result.ok &&
    (result.reason === 'invalid_down_payment' || result.reason === 'no_vat_rate_on_date')
  ) {
    return <Message text={t('apply.invalidDeal')} />;
  }
  const financed = quote ? quote.financedCents : price.priceCents - down;

  const deal: ApplicationDeal = {
    category: asset.category,
    financed_amount_cents: financed,
    term_months: term,
    ...(quote ? { monthly_rent_incl_vat_cents: quote.monthlyGrossRentCents } : {}),
  };

  const rows: [string, string][] = [
    [t('apply.deal.item'), `${asset.make} ${asset.model}`],
    [t('apply.deal.term'), t('apply.deal.termValue', { months: term })],
    [t('apply.deal.listPrice'), money(price.priceCents, locale)],
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
    <div className="mx-auto max-w-6xl px-4 py-10 text-[#353331] sm:px-6 sm:py-14">
      <div className="max-w-2xl">
        <h1 className="text-[2.25rem] leading-tight font-bold">{t('apply.title')}</h1>
        <p className="mt-[12px] text-[1.125rem] text-[#615b57]">{t('apply.intro')}</p>
      </div>
      <div className="mt-[32px]">
        <ApplicationForm
          locale={locale}
          deal={deal}
          signTarget={
            quote
              ? {
                  assetId: asset.id,
                  termMonths: term,
                  downPaymentCents: down,
                  signedOn: today,
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
      className="rounded-[12px] border border-[#dad9d8] bg-[#FFFFFF] p-[24px] text-[#353331]"
    >
      <h2 id="deal-heading" className="text-[1.375rem] leading-tight font-bold">
        {t('apply.deal.heading')}
      </h2>
      <dl className="mt-[12px] space-y-[8px] text-[0.875rem]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-[16px]">
            <dt className="text-[#615b57]">{label}</dt>
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
      <p className="rounded-[12px] border border-[#e9dac8] bg-[#f8f7f6] p-[24px] text-[#5c360a]">
        {text}
      </p>
    </div>
  );
}
