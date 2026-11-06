'use client';
import { useState } from 'react';
import type { Question } from '@/data/schemas';
import type { ApplicationAnswer } from '@/domain/application';
import { parseEuroCents } from '@/domain/application-fields';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export function ApplicationField({
  question,
  answer,
  locale,
  today,
  onChange,
}: {
  question: Question;
  answer: ApplicationAnswer | undefined;
  locale: Locale;
  today: string;
  onChange: (value: ApplicationAnswer) => void;
}) {
  const t = getT(locale);
  const [draft, setDraft] = useState(
    typeof answer === 'number'
      ? `${Math.floor(answer / 100)}.${String(answer % 100).padStart(2, '0')}`
      : Array.isArray(answer)
        ? answer.join('\n')
        : (answer ?? '')
  );
  const control =
    'mt-2 min-h-target w-full rounded-sm border border-hairline bg-canvas px-4 py-3 text-body';
  const why = `why-${question.id}`;
  function change(value: string) {
    setDraft(value);
    onChange(
      question.type === 'money'
        ? (parseEuroCents(value) ?? value)
        : question.type === 'list'
          ? value
              .split('\n')
              .map((part) => part.trim())
              .filter(Boolean)
          : value
    );
  }
  return (
    <div>
      <label htmlFor={question.id} className="text-body font-semibold">
        {question.text[locale]}
      </label>
      {question.type === 'choice' ? (
        <select
          id={question.id}
          required
          value={typeof answer === 'string' ? answer : ''}
          aria-describedby={why}
          onChange={(event) => change(event.target.value)}
          className={`${control} application-select`}
        >
          <option value="">{t('application.choose')}</option>
          {question.options?.map((value) => (
            <option key={value} value={value}>
              {t(`application.option.${value}` as MessageKey)}
            </option>
          ))}
        </select>
      ) : question.type === 'list' ? (
        <textarea
          id={question.id}
          required
          value={draft}
          rows={3}
          maxLength={1000}
          aria-describedby={why}
          onChange={(event) => change(event.target.value)}
          className={control}
        />
      ) : (
        <input
          id={question.id}
          required
          value={draft}
          maxLength={1000}
          type={question.type === 'date' ? 'date' : question.type === 'email' ? 'email' : 'text'}
          inputMode={question.type === 'money' ? 'decimal' : undefined}
          pattern={question.type === 'money' ? '[0-9]+([.,][0-9]{1,2})?' : undefined}
          max={question.type === 'date' ? today : undefined}
          aria-describedby={why}
          onChange={(event) => change(event.target.value)}
          className={control}
        />
      )}
      {question.type === 'list' ? (
        <p className="mt-2 text-caption text-ink-muted">{t('application.listHint')}</p>
      ) : null}
      <details id={why} className="mt-2 text-caption text-ink-muted">
        <summary className="inline-flex min-h-target cursor-pointer items-center text-primary">
          {t('application.why')}
        </summary>
        <p className="max-w-prose">{t(`application.why.${question.id}` as MessageKey)}</p>
      </details>
    </div>
  );
}
