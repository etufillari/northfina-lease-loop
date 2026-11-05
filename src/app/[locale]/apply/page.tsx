// The lease application page: UX flow development with all questions.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApplicationForm, type PlaceholderDealInfo } from '@/components/application-form';
import { loadQuestions } from '@/data/load';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';

export default async function ApplyPage({ params }: PageProps<'/[locale]/apply'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getT(locale);
  const questionsFile = await loadQuestions();

  // Placeholder configuration for UX development
  const dealInfo: PlaceholderDealInfo = {
    assetId: 'ebike-003',
    assetName: t('apply.placeholderAsset'),
    termMonths: 36,
    monthlyRentCents: 10730,
    formattedPrice: t('apply.placeholderPrice'),
  };

  const labels = {
    dealSummaryTitle: t('apply.dealSummary'),
    placeholderNotice: t('apply.placeholderNotice'),
    assetLabel: t('apply.item'),
    termLabel: t('apply.term'),
    estimatedPriceLabel: t('apply.estimatedPrice'),
    submitButton: t('apply.submit'),
    submittingButton: t('apply.submitting'),
    whyWeAskLabel: t('apply.whyWeAsk'),
    currencyHint: t('apply.currencyHint'),
    listHint: t('apply.listHint'),
    successTitle: t('apply.successTitle'),
    successMessage: t('apply.successMessage'),
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Back to catalogue navigation */}
      <div className="mb-6">
        <Link
          href={`/${locale}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
        >
          <span aria-hidden="true">&larr;</span>
          <span>{t('apply.backToCatalogue')}</span>
        </Link>
      </div>

      {/* Page Header */}
      <div className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('apply.title')}</h1>
        <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">{t('apply.intro')}</p>
      </div>

      {/* Application Form */}
      <ApplicationForm
        questions={questionsFile.questions}
        locale={locale}
        dealInfo={dealInfo}
        labels={labels}
      />
    </div>
  );
}
