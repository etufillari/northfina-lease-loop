import { notFound } from 'next/navigation';
import { ApplicationQuestion } from '@/components/application-question';
import { loadQuestions } from '@/data/load';
import { assetCategorySchema } from '@/data/schemas';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { todayIso } from '@/server/today';

export default async function ApplicationPage({
  params,
  searchParams,
}: PageProps<'/[locale]/apply'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getT(locale);
  const query = await searchParams;
  const category = assetCategorySchema.safeParse(query.category).data;
  const financedAmountCents = parseCents(query.financedAmountCents);
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

      {category && financedAmountCents !== undefined ? (
        <ApplicationQuestion
          question={firstQuestion}
          questionsFile={questions}
          category={category}
          financedAmountCents={financedAmountCents}
          contractStartDate={todayIso()}
          locale={locale}
        />
      ) : (
        <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950">
          <h2 className="text-xl font-semibold">{t('application.contextRequiredTitle')}</h2>
          <p className="mt-2 text-stone-700 dark:text-stone-300">
            {t('application.contextRequiredDescription')}
          </p>
        </section>
      )}
    </div>
  );
}

function parseCents(value: string | string[] | undefined): number | undefined {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined;
  const cents = Number(value);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : undefined;
}
