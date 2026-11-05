import { describe, expect, it } from 'vitest';
import { addCalendarDays, anniversary, calculateBillingSchedule, isDateOnly } from './calendar';
import type { LeaseTerms } from './types';

export const terms: LeaseTerms = {
  contractId: 'contract-1',
  assetId: 'ebike-003',
  customerId: 'cust-aino',
  startDate: '2026-11-05',
  termMonths: 36,
  monthlyNetCents: 10730,
  paymentDueDays: 14,
};

describe('date-only arithmetic', () => {
  it.each(['2026-02-29', '1900-02-29', '0000-01-01', '2026-13-01', '2026-1-01', 'bad'])(
    'rejects %s',
    (date) => {
      expect(isDateOnly(date)).toBe(false);
      expect(anniversary(date, 1)).toEqual({ ok: false, reason: 'invalid_date' });
    }
  );
  it('supports Gregorian leap years', () => {
    expect(isDateOnly('2000-02-29')).toBe(true);
    expect(isDateOnly('2028-02-29')).toBe(true);
  });
  it('clamps from the original anchor without drifting', () => {
    expect(anniversary('2026-01-31', 1)).toEqual({ ok: true, value: '2026-02-28' });
    expect(anniversary('2026-01-31', 2)).toEqual({ ok: true, value: '2026-03-31' });
    expect(anniversary('2026-01-31', 25)).toEqual({ ok: true, value: '2028-02-29' });
    expect(anniversary('2028-02-29', 12)).toEqual({ ok: true, value: '2029-02-28' });
  });
  it('adds calendar days across month and year boundaries', () => {
    expect(addCalendarDays('2026-02-28', 14)).toEqual({ ok: true, value: '2026-03-14' });
    expect(addCalendarDays('2028-02-29', 14)).toEqual({ ok: true, value: '2028-03-14' });
    expect(addCalendarDays('2026-12-31', 1)).toEqual({ ok: true, value: '2027-01-01' });
    expect(addCalendarDays('2026-11-05', 0)).toEqual({ ok: true, value: '2026-11-05' });
  });
  it('rejects invalid offsets and date overflow', () => {
    for (const offset of [-1, 1.5, Infinity, 1201])
      expect(anniversary(terms.startDate, offset).ok).toBe(false);
    for (const offset of [-1, 1.5, 366])
      expect(addCalendarDays(terms.startDate, offset).ok).toBe(false);
    expect(addCalendarDays('bad', 1).ok).toBe(false);
    expect(addCalendarDays('9999-12-31', 1).ok).toBe(false);
    expect(anniversary('9999-12-31', 1).ok).toBe(false);
  });
});

describe('billing schedule', () => {
  it('uses full anniversary months and calendar payment terms', () => {
    const result = calculateBillingSchedule(terms);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(36);
    expect(result.value[0]).toEqual({
      index: 1,
      startDate: '2026-11-05',
      endDateExclusive: '2026-12-05',
      issueDate: '2026-11-05',
      dueDate: '2026-11-19',
      netCents: 10730,
    });
    expect(result.value.reduce((sum, period) => sum + period.netCents, 0)).toBe(386280);
  });
  it('conserves rent and contiguous periods across many starts', () => {
    for (const year of [2026, 2028, 2100])
      for (const month of [1, 2, 4, 12]) {
        for (const day of [1, 15, 28])
          for (const termMonths of [12, 24, 36, 48] as const) {
            const startDate = `${year}-${String(month).padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            const result = calculateBillingSchedule({ ...terms, startDate, termMonths });
            expect(result.ok).toBe(true);
            if (!result.ok) continue;
            expect(result.value.reduce((sum, p) => sum + p.netCents, 0)).toBe(termMonths * 10730);
            result.value
              .slice(1)
              .forEach((p, i) => expect(p.startDate).toBe(result.value[i]?.endDateExclusive));
          }
      }
  });
  it('rejects invalid terms and unsafe totals', () => {
    for (const patch of [
      { contractId: '' },
      { assetId: ' ' },
      { customerId: '' },
      { monthlyNetCents: -1 },
      { monthlyNetCents: 0.5 },
      { paymentDueDays: -1 },
      { paymentDueDays: 61 },
      { startDate: 'bad' },
      { startDate: '9999-12-31' },
    ]) {
      expect(calculateBillingSchedule({ ...terms, ...patch }).ok).toBe(false);
    }
    expect(
      calculateBillingSchedule({ ...terms, monthlyNetCents: Number.MAX_SAFE_INTEGER })
    ).toEqual({ ok: false, reason: 'amount_overflow' });
    expect(calculateBillingSchedule({ ...terms, monthlyNetCents: 0 }).ok).toBe(true);
  });
});
