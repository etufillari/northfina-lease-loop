import { isIsoDate } from './calendar';

/** Joining records interest, never credit approval or an asset reservation. */
export function mayJoinWaitingList(input: {
  onDate: string;
  neededBy: string;
  monthlyBudgetCents: number;
  termMonths: number;
  supportedTerms: readonly number[];
}): { ok: true } | { ok: false; reason: 'date' | 'deadline' | 'budget' | 'term' } {
  if (!isIsoDate(input.onDate) || !isIsoDate(input.neededBy)) return { ok: false, reason: 'date' };
  if (input.neededBy < input.onDate) return { ok: false, reason: 'deadline' };
  if (
    !Number.isSafeInteger(input.monthlyBudgetCents) ||
    input.monthlyBudgetCents <= 0 ||
    input.monthlyBudgetCents > 2_147_483_647
  )
    return { ok: false, reason: 'budget' };
  if (!Number.isSafeInteger(input.termMonths) || !input.supportedTerms.includes(input.termMonths))
    return { ok: false, reason: 'term' };
  return { ok: true };
}
