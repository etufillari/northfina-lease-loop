import type { Answer, Answers } from '@/domain/question-flow';
import { customerTypeFromAnswers, normaliseAnswers } from '@/domain/question-flow';
import { answersForSubmission, moneyInputText } from './form-values';
import { ConsentAction } from './consent-action';
import { applicationConsentKey } from './consent-context';
import { ApplicationStatus } from './application-status';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { ApplicationView, QuoteView } from '@/server/spine-views';
import type { Bootstrap } from './price-panel';
import { buttonClass, Field, inputClass, messageFor, MoneyFacts, panelClass } from './ui';

type Props = {
  data: Bootstrap;
  quote: QuoteView;
  application: ApplicationView | null;
  answers: Answers;
  locale: Locale;
  busy: boolean;
  onAnswers: (answers: Answers) => void;
  onSubmit: () => void;
  onSign: () => void;
};

export function ApplicationPanel(props: Props) {
  const { data, quote, application, answers, locale, busy } = props;
  const t = getT(locale);
  const customerType = customerTypeFromAnswers(answers);
  const context = {
    customer_type: customerType,
    category: data.asset.category,
    financed_amount_cents: quote.terms.financedCents,
    term_months: quote.terms.termMonths,
  };
  const flow = normaliseAnswers(
    data.questions,
    context,
    answersForSubmission(data.questions, answers)
  );
  const waiting =
    application?.decision === 'manual_review' && application.reasons.includes('signatory_required');
  function change(id: string, value: Answer) {
    const next = { ...answers, [id]: value };
    const activeIds = new Set(
      normaliseAnswers(
        data.questions,
        { ...context, customer_type: customerTypeFromAnswers(next) },
        answersForSubmission(data.questions, next)
      ).activeQuestions.map((question) => question.id)
    );
    // Preserve incomplete typing in visible fields, but remove hidden dependent answers.
    props.onAnswers(Object.fromEntries(Object.entries(next).filter(([key]) => activeIds.has(key))));
  }

  return (
    <section className={panelClass} aria-labelledby="application-heading">
      <h2 id="application-heading" className="mb-4 text-xl font-semibold">
        {t('spine.application')}
      </h2>
      <div className="mb-5 space-y-2 text-sm">
        <p>{t('spine.answerSource')}</p>
        {customerType === 'consumer' && quote.terms.financedCents < 200000 ? (
          <p>{t('spine.incomeSkipped')}</p>
        ) : null}
        {quote.terms.financedCents < 1000000 ? <p>{t('spine.pepSkipped')}</p> : null}
        {customerType === 'company' ? <p>{t('spine.companyResidence')}</p> : null}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!waiting) props.onSubmit();
        }}
        noValidate
      >
        <fieldset disabled={busy || waiting} className="grid gap-5 md:grid-cols-2">
          {flow.activeQuestions.map((question) => {
            const id = question.id;
            const answer = answers[id];
            const invalid =
              application?.invalidQuestionIds.includes(id) ||
              application?.missingQuestionIds.includes(id);
            const shared = {
              id,
              className: inputClass,
              'aria-describedby': id + '-why',
              'aria-invalid': invalid || undefined,
            };
            return (
              <div key={id}>
                <Field id={id} label={question.text[locale]}>
                  {question.type === 'choice' ? (
                    <select
                      {...shared}
                      value={typeof answer === 'string' ? answer : ''}
                      onChange={(event) => change(id, event.target.value)}
                    >
                      <option value="">{t('spine.select')}</option>
                      {question.options?.map((option) => (
                        <option key={option} value={option}>
                          {messageFor(locale, 'spine.option.' + option)}
                        </option>
                      ))}
                    </select>
                  ) : question.type === 'list' ? (
                    <textarea
                      {...shared}
                      rows={3}
                      value={Array.isArray(answer) ? answer.join('\n') : ''}
                      onChange={(event) => change(id, event.target.value.split('\n'))}
                    />
                  ) : (
                    <input
                      {...shared}
                      type={
                        question.type === 'date'
                          ? 'date'
                          : question.type === 'email'
                            ? 'email'
                            : 'text'
                      }
                      inputMode={question.type === 'money' ? 'decimal' : undefined}
                      value={
                        question.type === 'money'
                          ? moneyInputText(answer)
                          : typeof answer === 'string'
                            ? answer
                            : ''
                      }
                      onChange={(event) => change(id, event.target.value)}
                    />
                  )}
                </Field>
                {question.type === 'list' ? (
                  <p className="mt-1 text-sm">{t('spine.listHelp')}</p>
                ) : null}
                {question.type === 'money' ? (
                  <p className="mt-1 text-sm">{t('spine.moneyUnit')}</p>
                ) : null}
                <p id={id + '-why'} className="mt-2 text-sm text-stone-600 dark:text-stone-300">
                  {messageFor(locale, 'spine.why.' + id)}
                </p>
                {invalid ? (
                  <p className="mt-1 font-medium text-red-700 dark:text-red-300">
                    {t('spine.required')}
                  </p>
                ) : null}
              </div>
            );
          })}
        </fieldset>
        <button className={buttonClass + ' mt-6'} disabled={busy || waiting}>
          {busy ? t('spine.pending') : t('spine.submitApplication')}
        </button>
      </form>
      {application ? (
        <ApplicationStatus
          application={application}
          questions={flow.activeQuestions}
          locale={locale}
        />
      ) : null}
      {waiting ? (
        <p className="mt-3 text-sm">
          {t('spine.signatory.pricePolicy', { date: quote.validThrough })}
        </p>
      ) : null}
      {application?.decision === 'approved' ? (
        <div className="mt-6 space-y-4 border-t border-stone-200 pt-6 dark:border-stone-800">
          <h3 className="text-lg font-semibold">{t('spine.review')}</h3>
          <p>{t('spine.reviewHelp')}</p>
          <p>
            {data.asset.make} {data.asset.model} · {quote.startDate} ·{' '}
            {t('spine.months', { count: quote.terms.termMonths })}
          </p>
          <MoneyFacts terms={quote.terms} locale={locale} />
          <p>{t('spine.endHelp')}</p>
          <ConsentAction
            key={applicationConsentKey({ locale, data, quote, application, answers })}
            label={t('spine.consent')}
            actionLabel={busy ? t('spine.pending') : t('spine.sign')}
            busy={busy}
            onConfirm={props.onSign}
          />
        </div>
      ) : null}
    </section>
  );
}
