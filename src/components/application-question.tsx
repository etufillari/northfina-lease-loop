import type { ApplicationAnswer } from '@/domain/applications/question-flow';
import { parseEuroCents } from '@/domain/money';
import type { Question } from '@/data/schemas';
import type { getT, MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { ApplicationFlowLabels } from './customer-application-flow';

type ApplicationQuestionProps = {
  question: Question;
  answer: ApplicationAnswer | undefined;
  draft: string | undefined;
  locale: Locale;
  t: ReturnType<typeof getT>;
  labels: ApplicationFlowLabels;
  emailError?: string;
  onChange: (value: string) => void;
};

export function ApplicationQuestion({
  question,
  answer,
  draft,
  locale,
  t,
  labels,
  emailError,
  onChange,
}: ApplicationQuestionProps) {
  const text = question.text[locale];
  const value = draft ?? draftForAnswer(question, answer);
  const inputClass =
    'mt-3 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-base dark:border-stone-600 dark:bg-stone-950';

  return (
    <div>
      {question.type === 'choice' ? (
        <fieldset>
          <legend className="text-lg font-semibold">{text}</legend>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {question.options?.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 p-3 transition has-checked:border-emerald-600 has-checked:bg-emerald-50 dark:border-stone-700 dark:has-checked:border-emerald-500 dark:has-checked:bg-emerald-950/50"
              >
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={value === option}
                  onChange={(event) => onChange(event.target.value)}
                  className="size-4 accent-emerald-700"
                />
                <span>{optionLabel(t, question.id, option)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : question.type === 'list' ? (
        <label htmlFor={question.id} className="block text-lg font-semibold">
          {text}
          <span className="mt-2 block text-sm font-normal text-stone-600 dark:text-stone-400">
            {labels.listHint}
          </span>
          <textarea
            id={question.id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={4}
            className={inputClass}
          />
        </label>
      ) : (
        <label htmlFor={question.id} className="block text-lg font-semibold">
          {text}
          {question.type === 'money' ? (
            <span className="mt-2 block text-sm font-normal text-stone-600 dark:text-stone-400">
              {labels.moneyHint}
            </span>
          ) : null}
          <input
            id={question.id}
            type={question.type === 'money' ? 'text' : question.type}
            required={question.type === 'email'}
            aria-invalid={Boolean(emailError)}
            inputMode={question.type === 'money' ? 'decimal' : undefined}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
          />
        </label>
      )}
      <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-400">
        <span className="font-medium text-stone-800 dark:text-stone-200">{labels.whyWeAsk}:</span>{' '}
        {question.why_we_ask[locale]}
      </p>
      {emailError ? (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {emailError}
        </p>
      ) : null}
      {question.validation ? (
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          {question.validation.hint[locale]}
        </p>
      ) : null}
    </div>
  );
}

export function answerFor(
  question: Question,
  draft: string | undefined,
  answer: ApplicationAnswer | undefined
): ApplicationAnswer | undefined {
  const value = draft ?? draftForAnswer(question, answer);
  if (question.type === 'money') return parseEuroCents(value);
  if (question.type === 'list') {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return value.trim();
}

export function answerIsPresent(answer: ApplicationAnswer | undefined): boolean {
  if (answer === undefined) return false;
  if (typeof answer === 'string') return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return Number.isFinite(answer);
}

function optionLabel(t: ReturnType<typeof getT>, questionId: string, option: string) {
  const keyByQuestion: Record<string, string> = {
    q_customer_type: 'application.customerType',
    q_country: 'application.country',
    q_employment: 'application.employment',
    q_can_sign: 'application.answer',
    q_pep: 'application.answer',
    q_usage_purpose: 'application.usagePurpose',
  };
  const prefix = keyByQuestion[questionId];
  return prefix ? t(`${prefix}.${option}` as MessageKey) : option;
}

function draftForAnswer(question: Question, answer: ApplicationAnswer | undefined): string {
  if (answer === undefined) return '';
  if (Array.isArray(answer)) return answer.join('\n');
  if (typeof answer === 'number' && question.type === 'money') {
    const euros = Math.floor(answer / 100);
    const cents = String(answer % 100).padStart(2, '0');
    return `${euros}.${cents}`;
  }
  return String(answer);
}
