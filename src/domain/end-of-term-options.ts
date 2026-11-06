import { anniversary, isDateOnly } from './lease-engine/calendar';

export const endOfTermChoices = ['buy', 'endEarly', 'return', 'extend'] as const;
export type EndOfTermChoice = (typeof endOfTermChoices)[number];

export type EndOfTermOptionsResult =
  { ok: true; choices: readonly EndOfTermChoice[] } | { ok: false; reason: 'invalid_date' };

const earlyLeaseChoices: readonly EndOfTermChoice[] = ['buy', 'endEarly'];
const endOfTermChoicesAfterPayment: readonly EndOfTermChoice[] = ['return', 'extend', 'buy'];

export type RemainingMonthsResult =
  { ok: true; months: number } | { ok: false; reason: 'invalid_date' | 'invalid_term' };

export function getRemainingMonths(
  today: string,
  startDate: string,
  termMonths: number
): RemainingMonthsResult {
  if (!isDateOnly(today) || !isDateOnly(startDate)) {
    return { ok: false, reason: 'invalid_date' };
  }
  if (!Number.isSafeInteger(termMonths) || termMonths < 1 || termMonths > 1200) {
    return { ok: false, reason: 'invalid_term' };
  }

  const endDate = anniversary(startDate, termMonths);
  if (!endDate.ok) return { ok: false, reason: 'invalid_date' };
  if (today >= endDate.value) return { ok: true, months: 0 };

  let elapsedMonths = 0;
  for (let month = 1; month <= termMonths; month++) {
    const monthStart = anniversary(startDate, month);
    if (!monthStart.ok) return { ok: false, reason: 'invalid_date' };
    if (monthStart.value > today) break;
    elapsedMonths = month;
  }

  return { ok: true, months: termMonths - elapsedMonths };
}

/** The final month starts one calendar month before the end date, clamped to that month's last day. */
export function getEndOfTermChoices(
  today: string,
  leaseEndDate: string,
  latestInvoicePaid: boolean
): EndOfTermOptionsResult {
  if (!isDateOnly(today) || !isDateOnly(leaseEndDate)) {
    return { ok: false, reason: 'invalid_date' };
  }
  if (today >= leaseEndDate) return { ok: true, choices: [] };

  const [yearText, monthText, dayText] = leaseEndDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const cutoffYear = month === 1 ? year - 1 : year;
  const cutoffMonth = month === 1 ? 12 : month - 1;
  const cutoffDay = Math.min(day, daysInMonth(cutoffYear, cutoffMonth));
  const finalMonthStarts = `${String(cutoffYear).padStart(4, '0')}-${String(cutoffMonth).padStart(2, '0')}-${String(cutoffDay).padStart(2, '0')}`;

  if (today < finalMonthStarts) return { ok: true, choices: earlyLeaseChoices };
  return {
    ok: true,
    choices: latestInvoicePaid ? endOfTermChoicesAfterPayment : earlyLeaseChoices,
  };
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
