import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { addDays, daysInMonth, isValidIsoDate } from './calendar';
import { generateSchedule, rowStatus, type ScheduleRow } from './schedule';

let vatRates: VatRates;

beforeAll(async () => {
  vatRates = await loadVatRates();
});

const card1 = {
  startDate: '2026-11-05',
  termMonths: 36,
  monthlyNetRentCents: 10_730,
  downPaymentCents: 0,
};

describe('generateSchedule', () => {
  it('card 1: three first invoices, the third at the 26 % rate', () => {
    const { rows } = generateSchedule(card1, vatRates);
    expect(rows).toHaveLength(36);
    expect(rows.slice(0, 3)).toEqual([
      {
        seq: 0,
        kind: 'rent',
        invoiceDate: '2026-11-05',
        periodStart: '2026-11-05',
        periodEnd: '2026-12-04',
        netCents: 10_730,
        vatRateBp: 2_550,
        vatCents: 2_736,
        grossCents: 13_466,
      },
      {
        seq: 1,
        kind: 'rent',
        invoiceDate: '2026-12-05',
        periodStart: '2026-12-05',
        periodEnd: '2027-01-04',
        netCents: 10_730,
        vatRateBp: 2_550,
        vatCents: 2_736,
        grossCents: 13_466,
      },
      {
        seq: 2,
        kind: 'rent',
        invoiceDate: '2027-01-05',
        periodStart: '2027-01-05',
        periodEnd: '2027-02-04',
        netCents: 10_730,
        vatRateBp: 2_600,
        vatCents: 2_790,
        grossCents: 13_520,
      },
    ]);
  });

  it('card 1: totals are the sum of the rows', () => {
    const schedule = generateSchedule(card1, vatRates);
    expect(schedule.totalRentNetCents).toBe(386_280);
    expect(schedule.totalNetCents).toBe(386_280);
    expect(schedule.totalGrossCents).toBe(486_612);
    expect(schedule.endDate).toBe('2029-11-04');
  });

  it('card 3: net rent stays locked while VAT follows the invoice date', () => {
    const { rows } = generateSchedule(
      { startDate: '2026-12-01', termMonths: 12, monthlyNetRentCents: 6_957, downPaymentCents: 0 },
      vatRates
    );
    expect(rows[0]).toMatchObject({ invoiceDate: '2026-12-01', netCents: 6_957, vatCents: 1_774 });
    expect(rows[1]).toMatchObject({ invoiceDate: '2027-01-01', netCents: 6_957, vatCents: 1_809 });
  });

  it('card 4: a 31 Jan start bills on 28 Feb 2026 and 29 Feb 2028', () => {
    const { rows } = generateSchedule(
      { startDate: '2026-01-31', termMonths: 48, monthlyNetRentCents: 3_432, downPaymentCents: 0 },
      vatRates
    );
    expect(rows[1]!.invoiceDate).toBe('2026-02-28');
    expect(rows[1]!.periodEnd).toBe('2026-03-30');
    expect(rows[2]!.invoiceDate).toBe('2026-03-31');
    expect(rows[25]!.invoiceDate).toBe('2028-02-29');
    expect(rows[0]!.periodEnd).toBe('2026-02-27');
  });

  it('puts a down payment first, as row 0 on the start date', () => {
    const schedule = generateSchedule(
      {
        startDate: '2026-11-05',
        termMonths: 12,
        monthlyNetRentCents: 5_000,
        downPaymentCents: 20_000,
      },
      vatRates
    );
    expect(schedule.rows).toHaveLength(13);
    expect(schedule.rows[0]).toMatchObject({
      seq: 0,
      kind: 'down_payment',
      invoiceDate: '2026-11-05',
      netCents: 20_000,
      vatCents: 5_100,
      grossCents: 25_100,
    });
    expect(schedule.rows[1]).toMatchObject({ seq: 1, kind: 'rent', invoiceDate: '2026-11-05' });
    expect(schedule.totalRentNetCents).toBe(60_000);
    expect(schedule.totalNetCents).toBe(80_000);
  });

  it('throws on bad input', () => {
    const bad = (patch: object) => () => generateSchedule({ ...card1, ...patch }, vatRates);
    expect(bad({ startDate: '2026-02-30' })).toThrow(RangeError);
    expect(bad({ termMonths: 0 })).toThrow(RangeError);
    expect(bad({ monthlyNetRentCents: 10.5 })).toThrow(RangeError);
    expect(bad({ downPaymentCents: -1 })).toThrow(RangeError);
  });

  it('throws when an invoice date has no VAT rate', () => {
    expect(() => generateSchedule({ ...card1, startDate: '2010-01-01' }, vatRates)).toThrow();
  });

  it('holds the money and calendar properties for random contracts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2025, max: 2032 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 31 }),
        fc.constantFrom(12, 24, 36, 48),
        fc.integer({ min: 0, max: 2_000_000 }),
        fc.integer({ min: 0, max: 5_000_000 }),
        (y, m, d, term, rent, down) => {
          const day = Math.min(d, daysInMonth(y, m));
          const startDate = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const s = generateSchedule(
            { startDate, termMonths: term, monthlyNetRentCents: rent, downPaymentCents: down },
            vatRates
          );
          const rents = s.rows.filter((r) => r.kind === 'rent');
          const sum = (key: 'netCents' | 'grossCents') => s.rows.reduce((t, r) => t + r[key], 0);

          expect(rents).toHaveLength(term);
          expect(sum('netCents')).toBe(rent * term + down);
          expect(sum('netCents')).toBe(s.totalNetCents);
          expect(sum('grossCents')).toBe(s.totalGrossCents);
          s.rows.forEach((r, i) => {
            expect(r.seq).toBe(i);
            expect(r.netCents).toBeGreaterThanOrEqual(0);
            expect(r.vatCents).toBeGreaterThanOrEqual(0);
            expect(r.grossCents).toBe(r.netCents + r.vatCents);
          });
          rents.forEach((r, i) => {
            expect(isValidIsoDate(r.invoiceDate)).toBe(true);
            const [ry, rm, rd] = r.invoiceDate.split('-').map(Number) as [number, number, number];
            expect(rd).toBe(Math.min(day, daysInMonth(ry, rm)));
            if (i > 0) expect(r.invoiceDate > rents[i - 1]!.invoiceDate).toBe(true);
            if (i > 0) expect(addDays(rents[i - 1]!.periodEnd, 1)).toBe(r.periodStart);
          });
        }
      ),
      { numRuns: 300 }
    );
  });
});

describe('rowStatus', () => {
  const row: Pick<ScheduleRow, 'invoiceDate' | 'periodEnd'> = {
    invoiceDate: '2026-12-05',
    periodEnd: '2027-01-04',
  };

  it('is upcoming before the invoice date', () => {
    expect(rowStatus(row, '2026-12-04')).toBe('upcoming');
  });

  it('is due from the invoice date to the end of its period', () => {
    expect(rowStatus(row, '2026-12-05')).toBe('due');
    expect(rowStatus(row, '2027-01-04')).toBe('due');
  });

  it('is past after its period', () => {
    expect(rowStatus(row, '2027-01-05')).toBe('past');
  });

  it('throws on an invalid asOf', () => {
    expect(() => rowStatus(row, '2026-13-01')).toThrow(RangeError);
  });
});
