import type { Question } from '@/data/schemas';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { ApplicationView } from '@/server/spine-views';
import { messageFor } from './ui';

/** Describe the saved decision and recipient, never an unsaved edit to the form. */
export function ApplicationStatus({
  application,
  questions,
  locale,
}: {
  application: ApplicationView;
  questions: readonly Pick<Question, 'id' | 'text'>[];
  locale: Locale;
}) {
  const t = getT(locale);
  const email = application.answers.q_signatory_email;
  const awaitingSigner =
    application.decision === 'manual_review' &&
    application.reasons.includes('signatory_required') &&
    application.answers.q_can_sign === 'no' &&
    typeof email === 'string';
  const problemIds = new Set([
    ...application.missingQuestionIds,
    ...application.invalidQuestionIds,
  ]);
  const problemQuestions = awaitingSigner
    ? []
    : questions.filter((question) => problemIds.has(question.id));
  const labelledIds = new Set(problemQuestions.map((question) => question.id));
  const allLabelled = (ids: string[]) => ids.length > 0 && ids.every((id) => labelledIds.has(id));
  const otherReasons = application.reasons.filter((reason) => {
    if (awaitingSigner && reason === 'signatory_required') return false;
    // Keep the generic explanation if a saved question is no longer in the visible form.
    if (reason === 'answers_missing' && allLabelled(application.missingQuestionIds)) return false;
    if (reason === 'answers_invalid' && allLabelled(application.invalidQuestionIds)) return false;
    return true;
  });
  const nextMessage = awaitingSigner
    ? null
    : application.decision === 'approved'
      ? 'spine.nextApproved'
      : application.decision === 'declined'
        ? 'spine.nextDeclined'
        : application.decision === 'manual_review'
          ? 'spine.nextManual'
          : null;

  return (
    <div className="mt-6" role="status">
      <h3 className="font-semibold">
        {awaitingSigner && otherReasons.length === 0
          ? t('spine.signatory.waiting')
          : messageFor(locale, 'spine.' + application.decision)}
      </h3>
      {awaitingSigner ? (
        <div className="mt-3 space-y-2">
          <p className="break-words font-medium">{t('spine.signatory.recipient', { email })}</p>
          <p>{t('spine.signatory.state')}</p>
          <p>{t('spine.signatory.next')}</p>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {t('spine.signatory.demoLimit')}
          </p>
        </div>
      ) : null}
      {otherReasons.length > 0 ? (
        <ul className="mt-2 list-disc pl-5">
          {otherReasons.map((reason) => (
            <li key={reason}>{messageFor(locale, 'spine.reason.' + reason)}</li>
          ))}
        </ul>
      ) : null}
      {problemQuestions.length > 0 ? (
        <div className="mt-3">
          <p className="font-medium">{t('spine.fixHeading')}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {problemQuestions.map((question) => (
              <li key={question.id}>
                <a href={'#' + question.id} className="underline underline-offset-4">
                  {question.text[locale]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {nextMessage ? <p className="mt-3">{t(nextMessage)}</p> : null}
    </div>
  );
}
