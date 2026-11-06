// A submitted application. When it is approved and its quote is still valid, the customer
// reads the draft contract here and signs it. Once signed, this page sends them to the contract.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { ContractDocument, type ContractView } from '@/components/contract-document';
import { SignContractForm } from '@/components/sign-contract-form';
import { loadCoefficientTable, loadCustomers } from '@/data/load';
import { effectivePriceLists } from '@/server/second-life';
import { effectiveVatRates } from '@/server/vat';
import { checkSignable, contractPeriod } from '@/domain/contract';
import { percentOfCents } from '@/domain/money';
import { differentPriceOn } from '@/domain/price-list';
import { vatPercentOn } from '@/domain/vat';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { getApplication } from '@/server/applications';
import { getAsset } from '@/server/assets';
import { getContractForApplication } from '@/server/contracts';
import { db } from '@/server/db';
import { currentViewer } from '@/server/current-viewer';
import { canSee } from '@/server/viewer';
import { NotYoursNotice } from '@/components/not-yours-notice';
import { appDate } from '@/server/app-date';

export default async function ApplicationPage({
  params,
}: PageProps<'/[locale]/applications/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const application = await getApplication(db, id);
  if (!application) notFound();
  // Demo login: only the customer it belongs to (or staff) sees it; see src/server/viewer.ts.
  if (!canSee(await currentViewer(), application.customerId)) {
    const owner = (await loadCustomers()).find((c) => c.id === application.customerId);
    return <NotYoursNotice ownerName={owner?.name ?? null} locale={locale} t={getT(locale)} />;
  }
  const contract = await getContractForApplication(db, application.id);
  if (contract) redirect(`/${locale}/contracts/${contract.id}`);

  const [asset, table, vatRates, priceLists] = await Promise.all([
    getAsset(db, application.assetId),
    loadCoefficientTable(),
    effectiveVatRates(db),
    effectivePriceLists(db),
  ]);
  if (!asset) notFound();

  const t = getT(locale);
  const { today } = await appDate();
  const check = checkSignable({
    decision: application.decision,
    quoteDate: application.quoteDate,
    signDate: today,
  });
  const itemHref = `/${locale}/assets/${asset.id}?term=${application.termMonths}&down=${application.downPaymentCents}`;
  const answers = application.answers;
  const buyoutPercent =
    table.end_of_term_buyout_percent_of_financed[String(application.termMonths)] ?? 0;

  const draft: ContractView = {
    number: null,
    customerType: application.customerType,
    customerName: answers.q_company_name?.trim() || application.applicantName || '',
    customerEmail: answers.q_email?.trim() || null,
    businessId: answers.q_business_id?.trim() || null,
    ...contractPeriod(today, application.termMonths),
    termMonths: application.termMonths,
    quoteDate: application.quoteDate,
    priceListVersion: application.priceListVersion,
    listPriceCents: application.listPriceCents,
    downPaymentCents: application.downPaymentCents,
    financedCents: application.financedCents,
    monthlyNetCents: application.monthlyNetCents,
    buyoutCents: percentOfCents(application.financedCents, buyoutPercent),
    signedDate: null,
    signerName: null,
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={itemHref}
        className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 print:hidden"
      >
        <span aria-hidden="true">&larr;</span>
        {t('apply.backToItem')}
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight print:hidden">
        {t('contract.reviewTitle')}
      </h1>

      {check.ok ? (
        <>
          <p className="mt-3 mb-6 text-stone-700 dark:text-stone-300 print:hidden">
            {t('contract.reviewIntro', { date: formatIsoDate(check.quoteValidUntil, locale) })}
          </p>
          <ContractDocument
            view={draft}
            asset={asset}
            vatPercentToday={vatPercentOn(vatRates, today)}
            todaysPrice={differentPriceOn(priceLists, asset.id, today, draft.listPriceCents)}
            locale={locale}
            t={t}
          />
          <SignContractForm
            applicationId={application.id}
            defaultName={application.applicantName ?? ''}
            locale={locale}
          />
        </>
      ) : (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <p className="font-semibold">
            {check.reason === 'not_approved'
              ? t(`apply.decision.${application.decision}`)
              : t('contract.error.expired')}
          </p>
          <p className="mt-2 text-stone-700 dark:text-stone-300">
            {check.reason === 'not_approved'
              ? t(`contract.cannotSign.${application.decision}`)
              : t('contract.expiredText', {
                  date: formatIsoDate(check.quoteValidUntil, locale),
                })}
          </p>
          {check.reason !== 'not_approved' ? (
            <Link
              href={itemHref}
              className="mt-4 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 font-semibold text-white hover:bg-emerald-800"
            >
              {t('contract.applyAgain')}
            </Link>
          ) : null}
        </section>
      )}
    </div>
  );
}
