import { notFound } from 'next/navigation';
import { ApplicationQuestion } from '@/components/application-question';
import { loadQuestions } from '@/data/load';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { todayIso } from '@/server/today';

export default async function ApplicationPage({ params }: PageProps<'/[locale]/apply'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getT(locale);
  const questions = await loadQuestions();
  const firstQuestion = questions.questions.find((question) => question.id === 'q_customer_type');
  if (!firstQuestion) throw new Error('Application question q_customer_type is missing');

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {t('application.step')}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('application.title')}
        </h1>
        <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">{t('application.intro')}</p>
      </header>

      <ApplicationQuestion
        question={firstQuestion}
        questionsFile={questions}
        contractStartDate={todayIso()}
        locale={locale}
      />
    </div>
  );
}
