import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import {
  buildSchedule,
  firstVatChange,
  hasVatRateChange,
  rentPeriod,
  scheduleTotals,
  type ScheduleInput,
} from './schedule';

// The real data pack: 25.5 % until 2026-12-31, the fictional 26 % from 2027-01-01.
let vatRates: VatRates;
beforeAll(async () => {
  vatRates = await loadVatRates();
});

function schedule(input: Omit<ScheduleInput, 'vatRates'>) {
  const result = buildSchedule({ ...input, vatRates });
  if (!result.ok) throw new Error(`no schedule: ${result.reason} ${result.date}`);
  return result.invoices;
}

describe('buildSchedule: card 1 (ebike-003, 36 months from 2026-11-05, net 10 730)', () => {
  const card1 = () =>
    schedule({
      signedOn: '2026-11-05',
      startDate: '2026-11-05',
      termMonths: 36,
      downPaymentCents: 0,
      monthlyNetCents: 10_730,
    });

  it('has no invoice 0 without a down payment and 36 rent invoices', () => {
    const invoices = card1();
    expect(invoices).toHaveLength(36);
    expect(invoices.map((i) => i.sequence)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
  });

  it('pins the first three invoices: 13 466 twice at 25.5 %, then 13 520 at 26 % in January', () => {
    expect(card1().slice(0, 3)).toEqual([
      {
        sequence: 1,
        kind: 'rent',
        periodStart: '2026-11-05',
        periodEnd: '2026-12-04',
        issueDate: '2026-11-05',
        dueDate: '2026-11-05',
        netCents: 10_730,
        vatRateBasisPoints: 2_550,
        vatCents: 2_736,
        grossCents: 13_466,
      },
      {
        sequence: 2,
        kind: 'rent',
        periodStart: '2026-12-05',
        periodEnd: '2027-01-04',
        issueDate: '2026-12-05',
        dueDate: '2026-12-05',
        netCents: 10_730,
        vatRateBasisPoints: 2_550,
        vatCents: 2_736,
        grossCents: 13_466,
      },
      {
        sequence: 3,
        kind: 'rent',
        periodStart: '2027-01-05',
        periodEnd: '2027-02-04',
        issueDate: '2027-01-05',
        dueDate: '2027-01-05',
        netCents: 10_730,
        vatRateBasisPoints: 2_600,
        vatCents: 2_790,
        grossCents: 13_520,
      },
    ]);
  });

  it('sums net to 36 × 10 730 and gross to net plus the per-line VAT', () => {
    const totals = scheduleTotals(card1());
    expect(totals.netCents).toBe(36 * 10_730);
    expect(totals.vatCents).toBe(2 * 2_736 + 34 * 2_790);
    expect(totals.grossCents).toBe(totals.netCents + totals.vatCents);
  });
});

describe('buildSchedule: card 3 (ebike-001, 24 months from 2026-09-15, net 6 957)', () => {
  it('bills December 2026 at 8 731 (25.5 %) and January 2027 at 8 766 (26 %)', () => {
    const invoices = schedule({
      signedOn: '2026-09-15',
      startDate: '2026-09-15',
      termMonths: 24,
      downPaymentCents: 0,
      monthlyNetCents: 6_957,
    });
    const december = invoices.find((i) => i.issueDate === '2026-12-15');
    const january = invoices.find((i) => i.issueDate === '2027-01-15');
    expect(december).toMatchObject({ sequence: 4, vatRateBasisPoints: 2_550, grossCents: 8_731 });
    expect(january).toMatchObject({ sequence: 5, vatRateBasisPoints: 2_600, grossCents: 8_766 });
  });
});

describe('buildSchedule: card 4 (laptop-001, 36 months from 2026-01-31, net 3 432)', () => {
  const invoices = () =>
    schedule({
      signedOn: '2026-01-31',
      startDate: '2026-01-31',
      termMonths: 36,
      downPaymentCents: 0,
      monthlyNetCents: 3_432,
    });

  it('is due on 28 Feb 2026 and on the leap day 29 Feb 2028', () => {
    const dueDates = invoices().map((i) => i.dueDate);
    expect(dueDates[1]).toBe('2026-02-28');
    expect(dueDates[2]).toBe('2026-03-31');
    expect(dueDates).toContain('2028-02-29');
    expect(invoices()[25]!.dueDate).toBe('2028-02-29');
  });

  it('ends its last period on 30 Jan 2029', () => {
    expect(invoices().at(-1)).toMatchObject({
      sequence: 36,
      periodStart: '2028-12-31',
      periodEnd: '2029-01-30',
    });
  });

  it('has contiguous periods: each starts the day after the last ended', () => {
    expect(rentPeriod('2026-01-31', 1)).toEqual({
      periodStart: '2026-01-31',
      periodEnd: '2026-02-27',
    });
    expect(rentPeriod('2026-01-31', 2)).toEqual({
      periodStart: '2026-02-28',
      periodEnd: '2026-03-30',
    });
  });
});

describe('buildSchedule: the VAT boundary (smart problem 1)', () => {
  it('gives an invoice issued exactly on 2027-01-01 26 % and one on 2026-12-31 25.5 %', () => {
    const fromNewYear = schedule({
      signedOn: '2026-12-20',
      startDate: '2027-01-01',
      termMonths: 12,
      downPaymentCents: 0,
      monthlyNetCents: 10_000,
    });
    expect(fromNewYear[0]).toMatchObject({ issueDate: '2027-01-01', vatRateBasisPoints: 2_600 });

    const fromEve = schedule({
      signedOn: '2026-12-31',
      startDate: '2026-12-31',
      termMonths: 12,
      downPaymentCents: 0,
      monthlyNetCents: 10_000,
    });
    expect(fromEve[0]).toMatchObject({ issueDate: '2026-12-31', vatRateBasisPoints: 2_550 });
    expect(fromEve[1]).toMatchObject({ issueDate: '2027-01-31', vatRateBasisPoints: 2_600 });
    expect(hasVatRateChange(fromEve)).toBe(true);
    expect(hasVatRateChange(fromNewYear)).toBe(false);
  });
});

describe('buildSchedule: the down payment (D5)', () => {
  it('is invoice 0, issued and due on the signing day at that day’s rate', () => {
    const invoices = schedule({
      signedOn: '2026-12-28',
      startDate: '2027-01-02',
      termMonths: 12,
      downPaymentCents: 50_000,
      monthlyNetCents: 10_000,
    });
    expect(invoices).toHaveLength(13);
    expect(invoices[0]).toEqual({
      sequence: 0,
      kind: 'down_payment',
      periodStart: null,
      periodEnd: null,
      issueDate: '2026-12-28',
      dueDate: '2026-12-28',
      netCents: 50_000,
      vatRateBasisPoints: 2_550,
      vatCents: 12_750,
      grossCents: 62_750,
    });
    expect(invoices[1]).toMatchObject({ sequence: 1, vatRateBasisPoints: 2_600 });
  });
});

describe('buildSchedule: edges', () => {
  it('answers no_vat_rate_on_date for a day before the table', () => {
    const gappy: VatRates = {
      country: 'FI',
      note: 'test',
      rates: [{ rate_percent: 24, valid_from: '2026-02-01', valid_to: null }],
    };
    expect(
      buildSchedule({
        signedOn: '2026-01-15',
        startDate: '2026-01-15',
        termMonths: 12,
        downPaymentCents: 0,
        monthlyNetCents: 1_000,
        vatRates: gappy,
      })
    ).toEqual({ ok: false, reason: 'no_vat_rate_on_date', date: '2026-01-15' });
  });

  it('throws on a zero term, a fraction of a cent or an impossible day', () => {
    const base = {
      signedOn: '2026-01-15',
      startDate: '2026-01-15',
      termMonths: 12,
      downPaymentCents: 0,
      monthlyNetCents: 1_000,
    };
    expect(() => buildSchedule({ ...base, vatRates, termMonths: 0 })).toThrow(RangeError);
    expect(() => buildSchedule({ ...base, vatRates, monthlyNetCents: 10.5 })).toThrow(RangeError);
    expect(() => buildSchedule({ ...base, vatRates, startDate: '2026-02-30' })).toThrow(RangeError);
  });

  it('sums an empty list to zero', () => {
    expect(scheduleTotals([])).toEqual({ netCents: 0, vatCents: 0, grossCents: 0 });
  });
});

describe('firstVatChange (the explanation under the table)', () => {
  it('finds card 3’s change: 25.5 % until 2026-12-31, 26 % from 2027-01-01', () => {
    const invoices = schedule({
      signedOn: '2026-09-15',
      startDate: '2026-09-15',
      termMonths: 24,
      downPaymentCents: 0,
      monthlyNetCents: 6_957,
    });
    expect(firstVatChange(invoices, vatRates)).toEqual({
      oldRateBasisPoints: 2_550,
      newRateBasisPoints: 2_600,
      lastOldDay: '2026-12-31',
      firstNewDay: '2027-01-01',
    });
  });

  it('is null when every invoice has one rate, and for no invoices', () => {
    const invoices = schedule({
      signedOn: '2027-03-01',
      startDate: '2027-03-01',
      termMonths: 12,
      downPaymentCents: 0,
      monthlyNetCents: 1_000,
    });
    expect(firstVatChange(invoices, vatRates)).toBeNull();
    expect(firstVatChange([], vatRates)).toBeNull();
  });
});
