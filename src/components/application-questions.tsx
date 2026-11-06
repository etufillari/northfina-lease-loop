'use client';
// The input for one question and the list of answers so far — split out of the wizard to
// keep files under 600 lines.
import { formatEuro } from '@/domain/money';
import type { MessageKey, Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type QuestionText = { en: string; fi?: string; sv?: string; et?: string };
export type Question = {
  id: string;
  type: 'choice' | 'text' | 'date' | 'email' | 'money' | 'list';
  text: Record<string, string>;
  why_we_ask: QuestionText;
  options?: string[];
};

const OPTION_KEYS = new Set([
  'consumer',
  'sole_trader',
  'company',
  'employed',
  'self_employed',
  'student',
  'retired',
  'unemployed',
  'yes',
  'no',
  'FI',
  'SE',
  'EE',
  'other',
  'commuting',
  'leisure',
  'delivery',
]);

export function optionLabel(t: Translate, option: string): string {
  return OPTION_KEYS.has(option) ? t(`option.${option}` as MessageKey) : option;
}

export function QuestionInput({
  t,
  question,
  draft,
  setDraft,
  busy,
  onSubmit,
}: {
  t: Translate;
  question: Question;
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  onSubmit: (value: unknown) => void;
}) {
  if (question.type === 'choice') {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        {question.options?.map((option) => (
          <button
            key={option}
            type="button"
            disabled={busy}
            onClick={() => onSubmit(option)}
            className="rounded-lg px-4 py-2 text-sm font-medium ring-1 ring-stone-300 ring-inset hover:bg-emerald-50 dark:ring-stone-700 dark:hover:bg-stone-800"
          >
            {optionLabel(t, option)}
          </button>
        ))}
      </div>
    );
  }
  const inputType =
    question.type === 'date'
      ? 'date'
      : question.type === 'email'
        ? 'email'
        : question.type === 'money'
          ? 'number'
          : 'text';
  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() === '') return;
        if (question.type === 'money') onSubmit(Math.round(Number(draft) * 100));
        else if (question.type === 'list')
          onSubmit(
            draft
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          );
        else onSubmit(draft.trim());
      }}
    >
      <input
        type={inputType}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        required
        min={question.type === 'money' ? 0 : undefined}
        className="flex-1 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {t('apply.continue')}
      </button>
    </form>
  );
}

export function AnsweredList({
  t,
  locale,
  answered,
  answers,
  onEdit,
}: {
  t: Translate;
  locale: Locale;
  answered: Question[];
  answers: Record<string, unknown>;
  onEdit: (id: string) => void;
}) {
  if (answered.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-stone-600 dark:text-stone-400">
        {t('apply.yourAnswers')}
      </h2>
      <ul className="mt-2 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white text-sm dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
        {answered.map((question) => {
          const value = answers[question.id];
          const shown =
            question.type === 'choice'
              ? optionLabel(t, String(value))
              : question.type === 'money'
                ? formatEuro(Number(value), intlLocale[locale])
                : Array.isArray(value)
                  ? value.join(', ')
                  : String(value);
          return (
            <li key={question.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-stone-600 dark:text-stone-400">
                  {question.text[locale] ?? question.text.en}
                </p>
                <p className="font-medium">{shown}</p>
              </div>
              <button
                type="button"
                onClick={() => onEdit(question.id)}
                className="shrink-0 text-emerald-800 hover:underline dark:text-emerald-300"
              >
                {t('apply.edit')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
