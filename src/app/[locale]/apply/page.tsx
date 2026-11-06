// Spine step 3: the lease application. Opened from an item's "Apply for this lease" button
// as /apply?asset=ebike-003&term=36&down=0. The deal is priced again here from the data pack;
// the values in the URL only say what the customer picked.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ApplicationForm } from '@/components/application-form';
import { loadCoefficientTable, loadPriceLists, loadQuestions, loadVatRates } from '@/data/load';
import { questionContext } from '@/domain/application';
import { formatEuro } from '@/domain/money';
import { listPriceOn } from '@/domain/price-list';
import { parsePriceSelection } from '@/domain/price-selection';
import { quoteLease } from '@/domain/pricing';
import { vatPercentOn } from '@/domain/vat';
import { formatIsoDate } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { intlLocale, isLocale, type Locale } from '@/i18n/locales';
import { getAsset } from '@/server/assets';
import { db } from '@/server/db';
import { appDate } from '@/server/app-date';
import { currentViewer } from '@/server/current-viewer';
import { prefillAnswers } from '@/domain/prefill';

export default async function ApplyPage({ params, searchParams }: PageProps<'/[locale]/apply'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: the price depends on today's date and the item on the database.
  await connection();

  const t = getT(locale);
  const search = await searchParams;
  const assetId = typeof search.asset === 'string' ? search.asset : null;
  const asset = assetId ? await getAsset(db, assetId) : null;
  if (!asset) {
    return (
      <Shell locale={locale} t={t}>
        <Notice title={t('apply.chooseItemTitle')} text={t('apply.chooseItemText')}>
          <Link href={`/${locale}`} className={buttonClass}>
            {t('apply.toCatalogue')}
          </Link>
        </Notice>
      </Shell>
    );
  }

  const [{ today }, viewer] = await Promise.all([appDate(), currentViewer()]);
  const [priceLists, table, vatRates, questionsFile] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
    loadQuestions(),
  ]);
  const itemHref = `/${locale}/assets/${asset.id}`;
  const price = listPriceOn(priceLists, asset.id, today);
  const vatPercent = vatPercentOn(vatRates, today);
  const selection = price.ok ? parsePriceSelection(search, price.priceCents, table) : null;
  const quoted =
    price.ok && selection && vatPercent !== null
      ? quoteLease({ listPriceCents: price.priceCents, vatPercent, ...selection }, table)
      : null;

  if (asset.status !== 'available' || !price.ok || !quoted?.ok) {
    return (
      <Shell locale={locale} t={t} backHref={itemHref}>
        <Notice
          title={`${asset.make} ${asset.model}`}
          text={asset.status !== 'available' ? t('apply.notAvailable') : t('apply.cannotQuote')}
        />
      </Shell>
    );
  }

  const quote = quoted.quote;
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const dealHref = `${itemHref}?term=${quote.termMonths}&down=${quote.downPaymentCents}`;
  const summary: [string, string][] = [
    [t('apply.item'), `${asset.make} ${asset.model}`],
    [t('apply.term'), t('apply.termValue', { months: quote.termMonths })],
    [t('apply.downPayment'), euro(quote.downPaymentCents)],
    [
      t('apply.monthly'),
      t('apply.monthlyValue', {
        gross: euro(quote.monthlyGrossCents),
        net: euro(quote.monthlyNetCents),
      }),
    ],
  ];

  return (
    <Shell locale={locale} t={t} backHref={dealHref}>
      <section
        aria-labelledby="deal-heading"
        className="mb-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="deal-heading" className="text-lg font-semibold">
            {t('apply.dealSummary')}
          </h2>
          <Link
            href={dealHref}
            className="text-sm font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-300"
          >
            {t('apply.changeDeal')}
          </Link>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {summary.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-stone-50 p-4 dark:bg-stone-800/50">
              <dt className="text-xs font-medium text-stone-600 dark:text-stone-400">{label}</dt>
              <dd className="mt-1 font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">
          {t('apply.priceNote', {
            version: price.priceListVersion,
            date: formatIsoDate(today, locale),
          })}
        </p>
      </section>

      <ApplicationForm
        questions={questionsFile.questions}
        context={questionContext({ category: asset.category, quote, todayIso: today, table })}
        deal={{
          assetId: asset.id,
          termMonths: quote.termMonths,
          downPaymentCents: quote.downPaymentCents,
        }}
        initialAnswers={viewer.kind === 'customer' ? prefillAnswers(viewer.customer) : {}}
        viewerKey={viewer.kind === 'customer' ? viewer.customer.id : viewer.kind}
        locale={locale}
      />
    </Shell>
  );
}

const buttonClass =
  'mt-4 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-emerald-800';

function Shell(props: { locale: Locale; t: Translate; backHref?: string; children: ReactNode }) {
  const { t, backHref, children } = props;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
        >
          <span aria-hidden="true">&larr;</span>
          {t('apply.backToItem')}
        </Link>
      ) : null}
      <div className="mt-6 mb-8 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('apply.title')}</h1>
        <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">{t('apply.intro')}</p>
      </div>
      {children}
    </div>
  );
}

function Notice(props: { title: string; text: string; children?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <h2 className="text-lg font-semibold">{props.title}</h2>
      <p className="mt-2 text-stone-700 dark:text-stone-300">{props.text}</p>
      {props.children}
    </section>
  );
}
