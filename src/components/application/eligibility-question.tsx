'use client';

import { useId } from 'react';
import type { Locale } from '@/i18n/locales';
import { getT } from '@/i18n/get-t';

const optionTranslationKeys = {
  q_customer_type: {
    consumer: 'application.options.q_customer_type.consumer',
    sole_trader: 'application.options.q_customer_type.sole_trader',
    company: 'application.options.q_customer_type.company',
  },
  q_country: {
    FI: 'application.options.q_country.FI',
    SE: 'application.options.q_country.SE',
    EE: 'application.options.q_country.EE',
  },
  q_employment: {
    employed: 'application.options.q_employment.employed',
    self_employed: 'application.options.q_employment.self_employed',
    unemployed: 'application.options.q_employment.unemployed',
    student: 'application.options.q_employment.student',
    retired: 'application.options.q_employment.retired',
    other: 'application.options.q_employment.other',
  },
  q_usage_purpose: {
    commuting: 'application.options.q_usage_purpose.commuting',
    leisure: 'application.options.q_usage_purpose.leisure',
    delivery: 'application.options.q_usage_purpose.delivery',
  },
} as const satisfies Record<string, Record<string, Parameters<ReturnType<typeof getT>>[0]>>;

export function getOptionLabel(questionId: string, option: string, locale: Locale) {
  const t = getT(locale);

  const key =
    optionTranslationKeys[questionId as keyof typeof optionTranslationKeys]?.[option as never];

  return key ? t(key) : option;
}

export type AnswerValue = string | number | string[];

export type ApplicationQuestion = {
  id: string;
  type: 'text' | 'email' | 'date' | 'choice' | 'money' | 'list';
  text: string;
  why_we_ask: string;
  options?: string[];
  hint?: string;
};

export type AnswerError = {
  question_id: string;
  reason: 'empty' | 'not_an_option' | 'not_a_date' | 'not_an_email' | 'not_cents' | 'not_a_list';
};

type EligibilityQuestionProps = {
  question: ApplicationQuestion;
  value: AnswerValue | undefined;
  error?: AnswerError;
  onChange: (value: AnswerValue) => void;
  locale: Locale;
  disabled?: boolean;
};

const inputClassName =
  'w-full rounded-xl border border-stone-700 bg-stone-900 px-3 py-2.5 text-sm text-stone-100 placeholder:text-stone-500 appearance-none outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 disabled:cursor-not-allowed disabled:opacity-60';

export default function EligibilityQuestion({
  question,
  value,
  error,
  onChange,
  locale,
  disabled = false,
}: EligibilityQuestionProps) {
  const id = useId();
  const t = getT(locale);

  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy =
    [question.hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  const inputValue = typeof value === 'string' || typeof value === 'number' ? String(value) : '';

  function renderInput() {
    switch (question.type) {
      case 'text':
      case 'email':
      case 'date':
        return (
          <input
            id={id}
            type={question.type}
            value={inputValue}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            className={inputClassName}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
          />
        );

      case 'choice':
        return (
          <select
            id={id}
            value={inputValue}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            className={`${inputClassName} [color-scheme:dark]`}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
          >
            <option key="placeholder" value="">
              {t('application.question.selectOption')}
            </option>

            {(question.options ?? []).map((option, index) => (
              <option key={`${option}-${index}`} value={option}>
                {getOptionLabel(question.id, option, locale)}
              </option>
            ))}
          </select>
        );

      case 'money': {
        const cents = typeof value === 'number' ? value : undefined;
        const euroValue = cents !== undefined ? String(cents / 100) : '';

        return (
          <div className="relative">
            <input
              id={id}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={euroValue}
              onChange={(event) => {
                const raw = event.target.value;

                if (raw === '') {
                  onChange('');
                  return;
                }

                const euros = Number(raw);

                if (
                  Number.isFinite(euros) &&
                  euros >= 0 &&
                  Number.isSafeInteger(Math.round(euros * 100))
                ) {
                  onChange(Math.round(euros * 100));
                }
              }}
              disabled={disabled}
              className={`${inputClassName} pr-12`}
              aria-invalid={Boolean(error)}
              aria-describedby={describedBy}
            />

            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-stone-500">
              €
            </span>
          </div>
        );
      }

      case 'list': {
        const items = Array.isArray(value) ? value : [''];

        return (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = event.target.value;
                    onChange(next);
                  }}
                  disabled={disabled}
                  className={inputClassName}
                  aria-label={t('application.question.entry', {
                    index: index + 1,
                  })}
                  aria-invalid={Boolean(error)}
                  aria-describedby={describedBy}
                />

                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(items.filter((_, i) => i !== index));
                    }}
                    disabled={disabled}
                    aria-label={t('application.question.removeEntry', {
                      index: index + 1,
                    })}
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-stone-800 hover:text-red-400 disabled:opacity-50"
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5">
                      <path
                        d="M4 10h12"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={() => onChange([...items, ''])}
              disabled={disabled}
              className="inline-flex items-center gap-2 rounded-lg py-1 text-sm font-medium text-emerald-400 transition-colors hover:text-emerald-300 disabled:opacity-50"
            >
              <span aria-hidden="true">+</span>
              {t('application.question.addAnother')}
            </button>
          </div>
        );
      }
    }
  }

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <label
          htmlFor={question.type === 'list' ? undefined : id}
          className="block text-sm font-semibold text-stone-100"
        >
          {question.text}
        </label>

        {question.why_we_ask && <p className="text-sm text-stone-400">{question.why_we_ask}</p>}
      </div>

      {renderInput()}

      {question.hint && (
        <p id={hintId} className="text-xs text-stone-400">
          {question.hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-400">
          {t(`application.question.error.${error.reason}`)}
        </p>
      )}
    </section>
  );
}
