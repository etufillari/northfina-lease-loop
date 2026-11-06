import type { AnswerValue } from '@/data/lease-schemas';
import { formatEuro } from '@/domain/money';
import type { Locale } from '@/i18n/locales';
import { getOptionLabel } from './eligibility-question';

/** An answer as a person should read it: labels for options, euros for money. */
export function formatAnswer(
  questionId: string,
  value: AnswerValue | undefined,
  locale: Locale
): string {
  if (value === undefined || value === '') return '—';

  const formatOption = (option: string) => getOptionLabel(questionId, option, locale);

  if (Array.isArray(value)) {
    return value.filter(Boolean).map(formatOption).join(', ') || '—';
  }

  // Only money answers are numbers, and they are in cents.
  return typeof value === 'string' ? formatOption(value) : formatEuro(value, locale);
}
