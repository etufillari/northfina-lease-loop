import type { Question } from '@/data/schemas';
import type { Answers } from '@/domain/question-flow';
import { parseCents } from '@/domain/money-arithmetic';

/** Keep raw text while editing. Prefilled numeric answers are already integer cents. */
export function moneyInputText(value: string | number | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'number') return '';
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('money prefill must be non-negative safe integer cents');
  }
  const cents = BigInt(value);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

/** Convert a COPY for targeting/submission; never replace the user's editing text. */
export function answersForSubmission(questions: readonly Question[], input: Answers): Answers {
  const moneyIds = new Set(
    questions.filter((question) => question.type === 'money').map((q) => q.id)
  );
  return Object.fromEntries(
    Object.entries(input).map(([id, value]) => {
      if (moneyIds.has(id) && typeof value === 'string') {
        const amount = parseCents(value);
        // Keep invalid text invalid: the server must report it, not receive zero or an old value.
        return [id, amount.ok ? amount.cents : value];
      }
      return [id, Array.isArray(value) ? [...value] : value];
    })
  );
}

/** Blank, decimals and exponent notation are not physical meter readings. */
export function wholeInput(text: string, minimum = 0, maximum = 2_147_483_647): number | null {
  const raw = text.trim();
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
}
