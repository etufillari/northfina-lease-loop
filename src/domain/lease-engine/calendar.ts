import type { BillingPeriod, EngineResult, LeaseTerms } from './types';

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parts(value: string): [number, number, number] | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return undefined;
  }
  return [year, month, day];
}

export function isDateOnly(value: string): boolean {
  return parts(value) !== undefined;
}

function format(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Always use the original anchor, so Jan 31 -> Feb 28 -> Mar 31. */
export function anniversary(startDate: string, months: number): EngineResult<string> {
  const start = parts(startDate);
  if (!start) return { ok: false, reason: 'invalid_date' };
  if (!Number.isSafeInteger(months) || months < 0 || months > 1200) {
    return { ok: false, reason: 'invalid_period' };
  }
  const [year, month, day] = start;
  const offset = year * 12 + month - 1 + months;
  const targetYear = Math.floor(offset / 12);
  const targetMonth = (offset % 12) + 1;
  if (targetYear > 9999) return { ok: false, reason: 'invalid_date' };
  return {
    ok: true,
    value: format(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth))),
  };
}

export function addCalendarDays(date: string, days: number): EngineResult<string> {
  const start = parts(date);
  if (!start) return { ok: false, reason: 'invalid_date' };
  if (!Number.isSafeInteger(days) || days < 0 || days > 365) {
    return { ok: false, reason: 'invalid_period' };
  }
  let [year, month, day] = start;
  for (let i = 0; i < days; i++) {
    day++;
    if (day > daysInMonth(year, month)) {
      day = 1;
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
  }
  return year > 9999
    ? { ok: false, reason: 'invalid_date' }
    : { ok: true, value: format(year, month, day) };
}

/** Full anniversary months, paid in advance; no first-month proration. */
export function calculateBillingSchedule(
  terms: LeaseTerms
): EngineResult<readonly BillingPeriod[]> {
  if (
    !terms.contractId.trim() ||
    !terms.assetId.trim() ||
    !terms.customerId.trim() ||
    ![12, 24, 36, 48].includes(terms.termMonths) ||
    !Number.isSafeInteger(terms.monthlyNetCents) ||
    terms.monthlyNetCents < 0 ||
    !Number.isSafeInteger(terms.paymentDueDays) ||
    terms.paymentDueDays < 0 ||
    terms.paymentDueDays > 60
  ) {
    return { ok: false, reason: 'invalid_terms' };
  }
  if (!Number.isSafeInteger(terms.monthlyNetCents * terms.termMonths)) {
    return { ok: false, reason: 'amount_overflow' };
  }
  const periods: BillingPeriod[] = [];
  for (let index = 1; index <= terms.termMonths; index++) {
    const start = anniversary(terms.startDate, index - 1);
    const end = anniversary(terms.startDate, index);
    if (!start.ok) return start;
    if (!end.ok) return end;
    const due = addCalendarDays(start.value, terms.paymentDueDays);
    if (!due.ok) return due;
    periods.push({
      index,
      startDate: start.value,
      endDateExclusive: end.value,
      issueDate: start.value,
      dueDate: due.value,
      netCents: terms.monthlyNetCents,
    });
  }
  return { ok: true, value: periods };
}
