'use client';

import { useState } from 'react';
import type { Question } from '@/data/schemas';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type ApplicationQuestionProps = {
  question: Question;
  locale: Locale;
};

export function ApplicationQuestion({ question, locale }: ApplicationQuestionProps) {
  const [selected, setSelected] = useState<string>();
  const options = question.options ?? [];
  const t = getT(locale);
  const questionText = question.text[locale];
  const whyText = question.why_we_ask[locale] ?? question.why_we_ask.en;

  return (
    <section
      aria-labelledby={`${question.id}-heading`}
      className="mt-10 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <p className="text-sm text-stone-600 dark:text-stone-400">Question 1</p>
      <h2 id={`${question.id}-heading`} className="mt-2 text-xl font-semibold">
        {questionText}
      </h2>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{whyText}</p>

      <fieldset className="mt-6">
        <legend className="sr-only">{questionText}</legend>
        <div className="grid gap-3">
          {options.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 p-4 has-checked:border-emerald-600 has-checked:bg-emerald-50 dark:border-stone-700 dark:has-checked:border-emerald-400 dark:has-checked:bg-emerald-950"
            >
              <input
                type="radio"
                name={question.id}
                value={option}
                checked={selected === option}
                onChange={() => setSelected(option)}
                className="size-4 accent-emerald-700"
              />
              <span>{optionLabel(option, t)}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}

function optionLabel(option: string, t: ReturnType<typeof getT>): string {
  const labels = {
    consumer: 'application.option.consumer',
    sole_trader: 'application.option.soleTrader',
    company: 'application.option.company',
    FI: 'application.option.finland',
    SE: 'application.option.sweden',
    EE: 'application.option.estonia',
    other: 'application.option.other',
    employed: 'application.option.employed',
    self_employed: 'application.option.selfEmployed',
    student: 'application.option.student',
    retired: 'application.option.retired',
    unemployed: 'application.option.unemployed',
    yes: 'application.option.yes',
    no: 'application.option.no',
    commuting: 'application.option.commuting',
    leisure: 'application.option.leisure',
    delivery: 'application.option.delivery',
  } as const;
  const key = labels[option as keyof typeof labels];
  return key ? t(key) : option.replaceAll('_', ' ');
}
