// One application question: its text and "why we ask" from data/questions.json, the right
// input for its type, and an inline message when the answer can't be accepted.
import type { Question } from '@/data/schemas';
import type { AnswerErrorCode } from '@/domain/question-flow';
import { messages, type MessageKey, type Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type QuestionFieldProps = {
  question: Question;
  value: string;
  error: AnswerErrorCode | undefined;
  onChange: (value: string) => void;
  locale: Locale;
  t: Translate;
};

const inputClass =
  'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/30 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100';

/** "sole_trader" → "Sole trader" in the current language; unknown codes are shown as they are. */
function optionLabel(option: string, t: Translate): string {
  const key = `answer.${option}`;
  return key in messages.en ? t(key as MessageKey) : option;
}

export function QuestionField({ question, value, error, onChange, locale, t }: QuestionFieldProps) {
  const inputId = `field-${question.id}`;
  const hintId = `${inputId}-why`;
  const errorId = `${inputId}-error`;
  const describedBy = [hintId, error ? errorId : null].filter(Boolean).join(' ');
  const text = question.text[locale];
  const why = question.why_we_ask[locale];

  const field = (() => {
    switch (question.type) {
      case 'choice':
        return (
          <div className="flex flex-wrap gap-2">
            {(question.options ?? []).map((option) => {
              const selected = value === option;
              return (
                <label
                  key={option}
                  className={
                    'flex cursor-pointer items-center rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-emerald-600 ' +
                    (selected
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-100'
                      : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300 dark:hover:bg-stone-800')
                  }
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={option}
                    checked={selected}
                    onChange={(event) => onChange(event.target.value)}
                    className="sr-only"
                  />
                  {optionLabel(option, t)}
                </label>
              );
            })}
          </div>
        );
      case 'money':
        return (
          <div className="relative max-w-xs">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-stone-500">
              €
            </span>
            <input
              id={inputId}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              aria-describedby={describedBy}
              className={`${inputClass} pl-8`}
            />
          </div>
        );
      case 'date':
        return (
          <input
            id={inputId}
            type="date"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby={describedBy}
            className={`${inputClass} max-w-xs`}
          />
        );
      default:
        return (
          <input
            id={inputId}
            type={question.type === 'email' ? 'email' : 'text'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={inputClass}
          />
        );
    }
  })();

  const hint =
    question.type === 'money'
      ? t('apply.currencyHint')
      : question.type === 'list'
        ? t('apply.listHint')
        : null;

  return (
    <fieldset className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <legend className="sr-only">{text}</legend>
      {question.type === 'choice' ? (
        <p className="font-semibold" aria-hidden="true">
          {text}
        </p>
      ) : (
        <label htmlFor={inputId} className="block font-semibold">
          {text}
        </label>
      )}
      <p id={hintId} className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        <span className="font-medium">{t('apply.whyWeAsk')}: </span>
        {why}
      </p>
      <div className="mt-3">{field}</div>
      {hint ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
      {error ? (
        <p id={errorId} className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-300">
          {t(`apply.error.${error}`)}
        </p>
      ) : null}
    </fieldset>
  );
}
