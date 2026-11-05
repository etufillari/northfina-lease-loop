'use client';

// One question of the application form. Which questions appear is decided by the server
// (POST /api/applications/evaluate); this component only draws one of them.
// Styling uses the design tokens from AGENTS.md, the same raw values as contract.tsx.
import { useState } from 'react';
import type { Question } from '@/data/schemas';
import { formatDayMonthYear, parseDayMonthYear } from '@/domain/date-input';
import { parseEuroToCents } from '@/domain/money';
import type { AnswerValue } from '@/domain/question-flow';
import { messages, type MessageKey, type Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

const inputClass =
  'mt-[8px] block w-full rounded-[8px] border border-[#dad9d8] bg-[#FFFFFF] px-[12px] py-[8px] text-[1rem] text-[#353331] focus:border-[#2877d7] dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:border-sky-500';
const mutedClass = 'mt-[4px] text-[0.875rem] text-[#615b57] dark:text-stone-400';
const labelClass = 'text-[1rem] font-semibold text-[#353331] dark:text-stone-200';

/** The label of a choice option. Falls back to the raw value if it has no translation. */
export function answerLabel(t: Translate, value: string): string {
  const key = `answer.${value}`;
  return key in messages.en ? t(key as MessageKey) : value;
}

type QuestionFieldProps = {
  question: Question;
  locale: Locale;
  t: Translate;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | undefined) => void;
};

export function QuestionField({ question, locale, t, value, onChange }: QuestionFieldProps) {
  const inputId = `q-${question.id}`;
  const whyId = `${inputId}-why`;
  const hintId = `${inputId}-hint`;
  const label = question.text[locale];
  const why = question.why_we_ask[locale] ?? question.why_we_ask.en;

  const whyWeAsk = (
    <p id={whyId} className={mutedClass}>
      <span className="font-semibold">{t('apply.whyWeAsk')}:</span> {why}
    </p>
  );

  if (question.type === 'choice') {
    return (
      <fieldset aria-describedby={whyId} className="min-w-0">
        <legend className={labelClass}>{label}</legend>
        {whyWeAsk}
        <div className="mt-[12px] flex flex-wrap gap-[8px]">
          {question.options!.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-[8px] rounded-[8px] border border-[#dad9d8] bg-[#FFFFFF] px-[12px] py-[8px] text-[#353331] has-[:checked]:border-[#2877d7] has-[:checked]:bg-[#f6f7f8] dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:has-[:checked]:border-sky-500 dark:has-[:checked]:bg-stone-700"
            >
              <input
                type="radio"
                name={question.id}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                className="size-[16px] accent-[#2877d7]"
              />
              {answerLabel(t, option)}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (question.type === 'money') {
    return (
      <MoneyField {...{ question, label, whyWeAsk, whyId, hintId, inputId, t, value, onChange }} />
    );
  }

  if (question.type === 'date') {
    return (
      <DateField {...{ question, label, whyWeAsk, whyId, hintId, inputId, t, value, onChange }} />
    );
  }

  const common = {
    id: inputId,
    name: question.id,
    'aria-describedby': whyId,
    className: inputClass,
    value: typeof value === 'string' ? value : '',
    onChange: (event: { target: { value: string } }) => onChange(event.target.value || undefined),
  };

  return (
    <div>
      <label htmlFor={inputId} className={labelClass}>
        {label}
      </label>
      {whyWeAsk}
      {question.type === 'list' ? (
        <>
          <p id={hintId} className={mutedClass}>
            {t('apply.list.hint')}
          </p>
          <textarea {...common} aria-describedby={`${whyId} ${hintId}`} rows={3} />
        </>
      ) : (
        <input
          {...common}
          type={question.type === 'email' ? 'email' : 'text'}
          autoComplete={question.type === 'email' ? 'email' : 'off'}
        />
      )}
    </div>
  );
}

/**
 * Money is typed as euros but answered in whole cents. The text is kept here, so half-typed input
 * such as "12," is not rewritten; the answer is only set while the text is a valid amount.
 */
function MoneyField({
  question,
  label,
  whyWeAsk,
  whyId,
  hintId,
  inputId,
  t,
  value,
  onChange,
}: {
  question: Question;
  label: string;
  whyWeAsk: React.ReactNode;
  whyId: string;
  hintId: string;
  inputId: string;
  t: Translate;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | undefined) => void;
}) {
  const [text, setText] = useState(typeof value === 'number' ? String(value / 100) : '');
  const invalid = text.trim() !== '' && parseEuroToCents(text) === null;

  return (
    <div>
      <label htmlFor={inputId} className={labelClass}>
        {label}
      </label>
      {whyWeAsk}
      <p id={hintId} className={mutedClass}>
        {t('apply.money.hint')}
      </p>
      <input
        id={inputId}
        name={question.id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        aria-describedby={`${whyId} ${hintId}`}
        aria-invalid={invalid}
        className={inputClass}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parseEuroToCents(event.target.value) ?? undefined);
        }}
      />
      {invalid ? (
        <p role="alert" className="mt-[4px] text-[0.875rem] text-[#DC2626] dark:text-red-400">
          {t('apply.money.invalid')}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Dates are typed as day/month/year (31/12/1990) but answered as ISO (1990-12-31). A native date
 * input would follow the browser's language instead, so this is a text field. The answer is only
 * set while the text is a real calendar date.
 */
function DateField({
  question,
  label,
  whyWeAsk,
  whyId,
  hintId,
  inputId,
  t,
  value,
  onChange,
}: {
  question: Question;
  label: string;
  whyWeAsk: React.ReactNode;
  whyId: string;
  hintId: string;
  inputId: string;
  t: Translate;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | undefined) => void;
}) {
  const [text, setText] = useState(typeof value === 'string' ? formatDayMonthYear(value) : '');
  const invalid = text.trim() !== '' && parseDayMonthYear(text) === null;

  return (
    <div>
      <label htmlFor={inputId} className={labelClass}>
        {label}
      </label>
      {whyWeAsk}
      <p id={hintId} className={mutedClass}>
        {t('apply.date.hint')}
      </p>
      <input
        id={inputId}
        name={question.id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        value={text}
        aria-describedby={`${whyId} ${hintId}`}
        aria-invalid={invalid}
        className={inputClass}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parseDayMonthYear(event.target.value) ?? undefined);
        }}
      />
      {invalid ? (
        <p role="alert" className="mt-[4px] text-[0.875rem] text-[#DC2626] dark:text-red-400">
          {t('apply.date.invalid')}
        </p>
      ) : null}
    </div>
  );
}
