import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetPricingControls } from '@/components/asset-pricing-controls';
import { LeaseApplication, LeaseQuestions } from '@/components/lease-application';
import { loadCoefficientTable, loadPriceLists, loadQuestions } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { LEASE_TERM_MONTHS, parseDownPaymentCents } from '@/domain/monthly-rent';
import { monthlyRentFor } from '@/domain/monthly-rent';
import { listPriceOn } from '@/domain/price-list';
import { formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { getActiveUser } from '@/server/active-user';
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

export default async function AssetDetailsPage({
  params,
  searchParams,
}: PageProps<'/[locale]/assets/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();

  await connection();
  const t = getT(locale);
  const today = todayIso();
  const query = await searchParams;
  const downPaymentInput = readOptionalText(query.downPayment) ?? '0';
  const downPaymentCents = parseDownPaymentCents(downPaymentInput);
  const termMonths = readTerm(query.term);
  const [assets, priceLists, coefficientTable, questionsFile, activeUser] = await Promise.all([
    listAssets(db),
    loadPriceLists(),
    loadCoefficientTable(),
    loadQuestions(),
    getActiveUser(),
  ]);
  const asset = assets.find((item) => item.id === id);
  if (!asset) notFound();

  const price = listPriceOn(priceLists, asset.id, today);
  const initialQuote =
    price.ok && downPaymentCents !== undefined
      ? monthlyRentFor(coefficientTable, price.priceCents, downPaymentCents, termMonths)
      : { ok: false as const };
  const termOptions = LEASE_TERM_MONTHS.map((value) => ({
    value,
    label: t('pricing.months', { count: value }),
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`/${locale}`}
        className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
      >
        {t('assetDetails.backToCatalogue')}
      </Link>

      <LeaseApplication
        assetId={asset.id}
        category={asset.category}
        financedAmountCents={Math.max(
          0,
          (price.ok ? price.priceCents : 0) - (downPaymentCents ?? 0)
        )}
        questions={questionsFile.questions}
        customer={activeUser}
        today={today}
        labels={{
          reserve: t('lease.reserve'),
          reservationInfo: t('lease.reservationInfo'),
          reservationError: t('lease.reservationError'),
          questionStep: t('lease.questionStep'),
          why: t('lease.why'),
          continue: t('lease.continue'),
          finish: t('lease.finish'),
          complete: t('lease.complete'),
          validationError: t('lease.validationError'),
          leaveWarning: t('lease.leaveWarning'),
          bindingWarning: t('lease.bindingWarning'),
          finishing: t('lease.finishing'),
          signingError: t('lease.signingError'),
          checkoutTitle: t('lease.checkoutTitle'),
          checkoutMonthlyRent: t('lease.checkoutMonthlyRent'),
          checkoutTerm: t('lease.checkoutTerm'),
          checkoutPaymentDue: t('lease.checkoutPaymentDue'),
          checkoutPriceList: t('lease.checkoutPriceList'),
          months: t('pricing.months'),
          days: t('lease.days'),
        }}
        initialOffer={{
          downPaymentCents: downPaymentCents ?? 0,
          termMonths,
          monthlyNetCents: initialQuote.ok ? initialQuote.monthlyRentCents : 0,
          priceListVersion: price.ok ? price.priceListVersion : 0,
          paymentDueDays: 14,
        }}
      >
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
              <Fact
                label={t('asset.listPrice')}
                value={
                  price.ok ? formatEuro(price.priceCents, intlLocale[locale]) : t('asset.noPrice')
                }
              />
            </dl>
          </section>
          <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <AssetPricingControls
              table={coefficientTable}
              listPriceCents={price.ok ? price.priceCents : undefined}
              locale={locale}
              initialDownPaymentCents={downPaymentCents ?? 0}
              initialTermMonths={termMonths}
              termOptions={termOptions}
              labels={{
                monthlyRate: t('asset.monthlyRate'),
                downPayment: t('pricing.downPayment'),
                term: t('pricing.term'),
                quoteUnavailable: t('pricing.quoteUnavailable'),
              }}
              available={asset.status === 'available'}
            />
          </aside>
        </div>
        <LeaseQuestions locale={locale} />
      </LeaseApplication>
    </div>
  );
}

function readOptionalText(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') notFound();
  return value;
}

function readTerm(value: string | string[] | undefined): number {
  if (value === undefined) return 0;
  if (typeof value !== 'string' || !LEASE_TERM_MONTHS.some((term) => String(term) === value)) {
    notFound();
  }
  return Number(value);
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
