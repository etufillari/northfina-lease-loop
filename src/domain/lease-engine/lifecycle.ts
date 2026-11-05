import { anniversary, calculateBillingSchedule, isDateOnly } from './calendar';
import type { EngineResult, LeaseStatus, LeaseTerms } from './types';

export type LeaseCommand = 'ACTIVATE' | 'COMPLETE' | 'TERMINATE';

/** State decisions only: caller must atomically guard asset allocation and persist the result. */
export function transitionLease(
  current: LeaseStatus | null,
  command: LeaseCommand,
  terms: LeaseTerms,
  asOf: string
): EngineResult<LeaseStatus> {
  const schedule = calculateBillingSchedule(terms);
  if (!schedule.ok) return schedule;
  if (!isDateOnly(asOf)) return { ok: false, reason: 'invalid_date' };
  if (current === null && command === 'ACTIVATE' && asOf === terms.startDate) {
    return { ok: true, value: 'ACTIVE' };
  }
  if (current !== 'ACTIVE') return { ok: false, reason: 'invalid_transition' };
  const end = anniversary(terms.startDate, terms.termMonths);
  if (!end.ok) return end;
  if (command === 'COMPLETE') {
    return asOf >= end.value
      ? { ok: true, value: 'COMPLETED' }
      : { ok: false, reason: 'before_end_date' };
  }
  // Early termination is restricted to anniversary boundaries. Settlement is not implemented yet.
  if (
    command === 'TERMINATE' &&
    asOf < end.value &&
    schedule.value.some((period) => period.startDate === asOf)
  ) {
    return { ok: true, value: 'TERMINATED' };
  }
  return { ok: false, reason: 'invalid_transition' };
}
