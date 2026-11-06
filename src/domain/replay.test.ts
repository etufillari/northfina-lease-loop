// Expected values are worked by hand from the DATA.md worked example (card 1: Aino, ebike-003,
// 36 months from 5 Nov 2026, 10 730 net a month): 25.5 % VAT → 2 736 (gross 13 466) up to
// Dec 2026, 26 % → 2 790 (gross 13 520) from Jan 2027. Early-exit prices are the hand-worked
// figures in early-exit.test.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadResidualCurves, loadVatRates } from '@/data/load';
import type { ResidualCurves, VatRates } from '@/data/schemas';
import type { ExitContext, ExitContract } from './early-exit';
import { billedBefore, invoiceSchedule, type InvoicedContract } from './invoicing';
import { replayMonth, replayMonthCount, type ReplayInput } from './replay';

let vatRates: VatRates;
let curves: ResidualCurves;
beforeAll(async () => {
  [vatRates, curves] = await Promise.all([loadVatRates(), loadResidualCurves()]);
});

const aino: ExitContract & InvoicedContract = {
  customerId: 'cust-aino',
  startDate: '2026-11-05',
  termMonths: 36,
  monthlyNetRentCents: 10_730,
  downPaymentCents: 0,
  buyoutCents: 58_350,
  listPriceCents: 389_000,
  billing: 'start_day_full_months',
};

function input(
  overrides: Partial<InvoicedContract> = {},
  options: { endDate?: string; priced?: boolean } = {}
): ReplayInput {
  const contract = { ...aino, ...overrides };
  const schedule = invoiceSchedule(contract, vatRates);
  if (!schedule.ok) throw new Error(schedule.reason);
  const context: ExitContext = {
    vatRates,
    curves,
    annualInterestPercent: 7.9,
    item: { category: 'e_bike', ageAtStartMonths: 0, condition: 'new', usageValue: 0 },
  };
  return {
    schedule: billedBefore(schedule, options.endDate ?? null),
    termMonths: contract.termMonths,
    earlyExit: options.priced === false ? null : { contract, context },
  };
}

describe('replayMonthCount', () => {
  it('is the whole term while the lease runs', () => {
    expect(replayMonthCount(input())).toBe(36);
  });

  it('stops at the last invoice issued before an early exit took effect', () => {
    // Leaving in month 7 takes effect on 5 Jun 2027: invoices 1…7 are issued, 8…36 cancelled.
    expect(replayMonthCount(input({}, { endDate: '2027-06-05' }))).toBe(7);
  });
});

describe('replayMonth', () => {
  it('month 1: one invoice issued, at 25.5 %', () => {
    const m = replayMonth(input(), 1);
    expect(m).toMatchObject({
      month: 1,
      issuedCount: 1,
      vatRatePercent: 25.5,
      previousVatRatePercent: null,
      vatChanged: false,
      endOfTermOpen: false,
    });
    expect(m.invoice).toMatchObject({ number: 1, invoiceDate: '2026-11-05', grossCents: 13_466 });
    // 10 730 + 2 736 = 13 466.
    expect(m.totals).toEqual({ netCents: 10_730, vatCents: 2_736, grossCents: 13_466 });
  });

  it('month 2: still 25.5 %, two invoices added up', () => {
    // 2 × 10 730 = 21 460 net; 2 × 2 736 = 5 472 VAT; 26 932 gross.
    expect(replayMonth(input(), 2).totals).toEqual({
      netCents: 21_460,
      vatCents: 5_472,
      grossCents: 26_932,
    });
  });

  it('month 3 is the first invoice at 26 %: the VAT step of 1 Jan 2027 (Smart Problem 1)', () => {
    const m = replayMonth(input(), 3);
    expect(m).toMatchObject({
      vatRatePercent: 26,
      previousVatRatePercent: 25.5,
      vatChanged: true,
    });
    expect(m.invoice).toMatchObject({ invoiceDate: '2027-01-05', vatCents: 2_790 });
    // 3 × 10 730 = 32 190 net; 5 472 + 2 790 = 8 262 VAT; 40 452 gross.
    expect(m.totals).toEqual({ netCents: 32_190, vatCents: 8_262, grossCents: 40_452 });
  });

  it('month 4 is at 26 % too, but the step is behind it', () => {
    expect(replayMonth(input(), 4)).toMatchObject({
      vatRatePercent: 26,
      previousVatRatePercent: 26,
      vatChanged: false,
    });
  });

  it('the final month adds up to the whole schedule and opens the end-of-term choice', () => {
    const m = replayMonth(input(), 36);
    // 36 × 10 730 = 386 280; VAT 2 × 2 736 + 34 × 2 790 = 100 332 (invoicing.test.ts).
    expect(m.totals).toEqual({ netCents: 386_280, vatCents: 100_332, grossCents: 486_612 });
    expect(m.issuedCount).toBe(36);
    expect(m.endOfTermOpen).toBe(true);
    // Leaving in the last month is exactly the buyout: 58 350 + 26 % = 73 521.
    expect(m.earlyExit?.buyGrossCents).toBe(73_521);
  });

  it('the end-of-term choice is closed every month before the last', () => {
    expect(replayMonth(input(), 35).endOfTermOpen).toBe(false);
  });

  it('prices leaving early in that month (card 1 month 1, card 8 month 7)', () => {
    expect(replayMonth(input(), 1).earlyExit).toEqual({
      effectiveDate: '2026-12-05',
      buyGrossCents: 480_696,
      handBackGrossCents: expect.any(Number),
    });
    expect(replayMonth(input(), 7).earlyExit).toEqual({
      effectiveDate: '2027-06-05',
      buyGrossCents: 418_982,
      handBackGrossCents: 26_870,
    });
  });

  it('shows no early-exit price when leaving early can’t be priced', () => {
    expect(replayMonth(input({}, { priced: false }), 7).earlyExit).toBeNull();
  });

  it('counts the down payment (invoice 0) from month 1', () => {
    // 50 000 net at 25.5 % → 12 750 VAT. Month 1: 60 730 net, 15 486 VAT, 76 216 gross.
    const m = replayMonth(input({ downPaymentCents: 50_000 }), 1);
    expect(m.issuedCount).toBe(2);
    expect(m.totals).toEqual({ netCents: 60_730, vatCents: 15_486, grossCents: 76_216 });
  });

  it('never opens the end-of-term choice on a lease that ended early', () => {
    expect(replayMonth(input({}, { endDate: '2027-06-05' }), 7).endOfTermOpen).toBe(false);
  });

  it('throws for a month outside the issued invoices (a bug, not a customer refusal)', () => {
    expect(() => replayMonth(input(), 0)).toThrow(RangeError);
    expect(() => replayMonth(input(), 37)).toThrow(RangeError);
    expect(() => replayMonth(input(), 1.5)).toThrow(RangeError);
    expect(() => replayMonth(input({}, { endDate: '2027-06-05' }), 8)).toThrow(RangeError);
  });
});
