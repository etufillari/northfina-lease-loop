// Expected values are worked by hand (bc -l, 20 decimals) from the data pack, never by the code.
// r = annual_interest_percent / 12 / 100; v = 1 / (1 + r); a rent n months away is worth rent × vⁿ.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadResidualCurves, loadVatRates } from '@/data/load';
import type { CoefficientTable, ResidualCurves, VatRates } from '@/data/schemas';
import {
  bandInterestPercent,
  earlyExitOn,
  earlyExitQuote,
  endEarly,
  exitMonthOn,
  itemAgeAtStart,
  type ExitContext,
  type ExitContract,
} from './early-exit';
import { buyoutInvoice } from './end-of-term';

let vatRates: VatRates;
let curves: ResidualCurves;
let table: CoefficientTable;
beforeAll(async () => {
  [vatRates, curves, table] = await Promise.all([
    loadVatRates(),
    loadResidualCurves(),
    loadCoefficientTable(),
  ]);
});

// Card 1: Aino, ebike-003 (new, 0 km), 36 months from 5 Nov 2026, band B at 7.9 %.
// Rent 389 000 × 0.027584 = 10 730; buyout 15 % = 58 350 (DATA.md worked example).
const aino: ExitContract = {
  customerId: 'cust-aino',
  startDate: '2026-11-05',
  termMonths: 36,
  monthlyNetRentCents: 10_730,
  buyoutCents: 58_350,
  listPriceCents: 389_000,
  billing: 'start_day_full_months',
};
const ainoContext = (): ExitContext => ({
  vatRates,
  curves,
  annualInterestPercent: 7.9,
  item: { category: 'e_bike', ageAtStartMonths: 0, condition: 'new', usageValue: 0 },
});

function quote(contract: ExitContract, context: ExitContext, month: number) {
  const result = earlyExitQuote(contract, context, month);
  if (!result.ok) throw new Error(result.reason);
  return result.quote;
}

describe('exitMonthOn', () => {
  it('is the invoice month the date falls in', () => {
    expect(exitMonthOn(aino, '2026-11-05')).toEqual({ ok: true, month: 1 });
    expect(exitMonthOn(aino, '2026-12-04')).toEqual({ ok: true, month: 1 });
    expect(exitMonthOn(aino, '2026-12-05')).toEqual({ ok: true, month: 2 });
    // Card 8: invoice 7 is dated 5 May 2027 and covers 5 May – 4 Jun 2027.
    expect(exitMonthOn(aino, '2027-05-20')).toEqual({ ok: true, month: 7 });
    // Invoice 36 is dated 5 Oct 2029; the lease ends on 4 Nov 2029.
    expect(exitMonthOn(aino, '2029-11-04')).toEqual({ ok: true, month: 36 });
  });

  it('follows the clamped invoice dates of a 31st start (card 4)', () => {
    const card4 = { ...aino, startDate: '2026-01-31' };
    // Invoice 2 is due 28 Feb 2026, so 27 Feb is still month 1.
    expect(exitMonthOn(card4, '2026-02-27')).toEqual({ ok: true, month: 1 });
    expect(exitMonthOn(card4, '2026-02-28')).toEqual({ ok: true, month: 2 });
  });

  it('refuses a date before the start or after the term', () => {
    expect(exitMonthOn(aino, '2026-11-04')).toEqual({ ok: false, reason: 'not_started' });
    // 5 Nov 2029 is the handover date: that is the normal end of term (D-029), not an early exit.
    expect(exitMonthOn(aino, '2029-11-05')).toEqual({ ok: false, reason: 'term_over' });
  });
});

describe('card 8: Aino ends the lease from card 1 in month 7', () => {
  it('prices buying out early and handing back early, line by line', () => {
    const q = quote(aino, ainoContext(), 7);
    // Invoices 1–7 are paid; the exit takes effect when month 7 ends: 5 Jun 2027.
    expect(q.effectiveDate).toBe('2027-06-05');
    expect(q.monthsLeft).toBe(29);
    // 29 × 10 730 = 311 170 still to pay.
    expect(q.remainingRentsCents).toBe(311_170);
    // r = 7.9 / 1200 = 0.00658333…; v = 1 / (1 + r); v²⁹ = 0.826718542679.
    // Rents are billed in advance (D-016): rent 8 is due on 5 Jun 2027 itself, so rent 7 + j is
    // discounted j − 1 months (D-039). 10 730 × (1 + v + … + v²⁸) = 10 730 × 26.494515481
    // = 284 286.151 → 284 286.
    expect(q.remainingRentsPvCents).toBe(284_286);
    // 58 350 × v²⁹ = 48 239.027 → 48 239.
    expect(q.buyoutPvCents).toBe(48_239);
    // Buy early: 284 286 + 48 239 = 332 525; discount 311 170 + 58 350 − 332 525 = 36 995.
    expect(q.buy.netCents).toBe(332_525);
    expect(q.buy.discountCents).toBe(36_995);
    // VAT 26 % on 5 Jun 2027: 86 456.5 → 86 457 (half up); total 418 982.
    expect(q.vatRatePercent).toBe(26);
    expect(q.buy.vatCents).toBe(86_457);
    expect(q.buy.grossCents).toBe(418_982);
    // The bike now (age 7, curve 82 + (70 − 82) / 6 = 80 %): 389 000 × 0.80 = 311 200.
    expect(q.valueNowCents).toBe(311_200);
    // At the end (age 36, 40 %): 155 600, more than the 58 350 buyout, so staying to the end
    // Aino would have bought it: the end amount is the buyout.
    expect(q.valueAtEndCents).toBe(155_600);
    expect(q.endAmountCents).toBe(58_350);
    expect(q.endAmountPvCents).toBe(48_239);
    // Hand back early: 284 286 + 48 239 − 311 200 = 21 325; VAT 5 544.5 → 5 545; 26 870.
    expect(q.handBack.netCents).toBe(21_325);
    expect(q.handBack.vatCents).toBe(5_545);
    expect(q.handBack.grossCents).toBe(26_870);
  });

  it('is what earlyExitOn gives for a decision made during month 7', () => {
    const result = earlyExitOn(aino, ainoContext(), '2027-05-20');
    expect(result.ok && result.quote.exitMonth).toBe(7);
    expect(result.ok && result.quote.handBack.netCents).toBe(21_325);
  });
});

describe('earlyExitQuote edge cases', () => {
  it('month 1: 35 rents left, VAT still 25.5 % on 5 Dec 2026', () => {
    const q = quote(aino, ainoContext(), 1);
    expect(q.effectiveDate).toBe('2026-12-05');
    // 10 730 × (1 + v + … + v³⁴) = 10 730 × 31.374426020 = 336 647.591 → 336 648;
    // 58 350 × v³⁵ = 46 376.730 → 46 377.
    expect(q.remainingRentsPvCents).toBe(336_648);
    expect(q.buyoutPvCents).toBe(46_377);
    // 336 648 + 46 377 = 383 025; VAT 25.5 % = 97 671.375 → 97 671.
    expect(q.buy.netCents).toBe(383_025);
    expect(q.vatRatePercent).toBe(25.5);
    expect(q.buy.vatCents).toBe(97_671);
    expect(q.buy.grossCents).toBe(480_696);
    // Age 1: 100 + (82 − 100) / 6 = 97 % → 377 330. 383 025 − 377 330 = 5 695;
    // VAT 1 452.225 → 1 452.
    expect(q.valueNowCents).toBe(377_330);
    expect(q.handBack.netCents).toBe(5_695);
    expect(q.handBack.vatCents).toBe(1_452);
  });

  it('month 2 takes effect on 5 Jan 2027, so VAT is 26 %', () => {
    expect(quote(aino, ainoContext(), 2).vatRatePercent).toBe(26);
  });

  it('the final month is exactly the end-of-term buyout (D-029), and handing back is free', () => {
    const q = quote(aino, ainoContext(), 36);
    expect(q.effectiveDate).toBe('2029-11-05');
    expect(q.remainingRentsCents).toBe(0);
    expect(q.buy.discountCents).toBe(0);
    // D-029, card 1: 583.50 € + 26 % = 735.21 €.
    expect(q.buy).toMatchObject({ netCents: 58_350, vatCents: 15_171, grossCents: 73_521 });
    expect(buyoutInvoice(aino, vatRates, '2029-11-05')).toMatchObject({
      vatRatePercent: q.vatRatePercent,
      netCents: q.buy.netCents,
      vatCents: q.buy.vatCents,
      grossCents: q.buy.grossCents,
    });
    expect(q.handBack).toMatchObject({ netCents: 0, vatCents: 0, grossCents: 0 });
  });

  it('counts the item’s value at the end when that is below the buyout', () => {
    // laptop, 12 months band A (9.9 %): 119 900 × 0.056022 = 6 717; buyout 40 % = 47 960.
    // Delivered poor: at age 12 it is worth 119 900 × 60 % × 0.4 = 28 776 < 47 960, so at the
    // end the customer would hand it back rather than pay the buyout.
    const laptop: ExitContract = {
      ...aino,
      startDate: '2027-03-01',
      termMonths: 12,
      monthlyNetRentCents: 6_717,
      buyoutCents: 47_960,
      listPriceCents: 119_900,
    };
    const context: ExitContext = {
      ...ainoContext(),
      annualInterestPercent: 9.9,
      item: { category: 'laptop', ageAtStartMonths: 0, condition: 'poor', usageValue: 0 },
    };
    const q = quote(laptop, context, 11);
    // r = 0.00825. One rent left, due on the exit day itself: 6 717, not discounted.
    expect(q.remainingRentsPvCents).toBe(6_717);
    expect(q.endAmountCents).toBe(28_776);
    // 28 776 / 1.00825 = 28 540.541 → 28 541.
    expect(q.endAmountPvCents).toBe(28_541);
    // Age 11: 75 + (60 − 75) × 5/6 = 62.5 % × 0.4 → 119 900 × 0.25 = 29 975.
    expect(q.valueNowCents).toBe(29_975);
    // 6 717 + 28 541 − 29 975 = 5 283. Buy: 6 717 + 47 960 / 1.00825 (47 567.568 → 47 568).
    expect(q.handBack.netCents).toBe(5_283);
    expect(q.buy.netCents).toBe(54_285);
  });

  it('never charges a negative amount for handing back', () => {
    // Worth more now than everything still owed: handing back costs nothing.
    const cheap = { ...aino, monthlyNetRentCents: 100, buyoutCents: 100 };
    expect(quote(cheap, ainoContext(), 7).handBack.netCents).toBe(0);
  });

  it('refuses when there is no VAT rate on the effective date', () => {
    const gap: VatRates = { ...vatRates, rates: vatRates.rates.slice(0, -1) };
    expect(earlyExitQuote(aino, { ...ainoContext(), vatRates: gap }, 7)).toEqual({
      ok: false,
      reason: 'no_vat_rate',
    });
  });

  it('throws for a month outside the term (a bug, not a customer refusal)', () => {
    expect(() => earlyExitQuote(aino, ainoContext(), 0)).toThrow(RangeError);
    expect(() => earlyExitQuote(aino, ainoContext(), 37)).toThrow(RangeError);
  });

  it('passes on the refusals of exitMonthOn', () => {
    expect(earlyExitOn(aino, ainoContext(), '2026-11-04')).toEqual({
      ok: false,
      reason: 'not_started',
    });
  });
});

describe('bandInterestPercent', () => {
  it('reads the band’s annual interest from the coefficient table', () => {
    expect(bandInterestPercent(table, 'B')).toBe(7.9);
    expect(bandInterestPercent(table, 'Z')).toBeNull();
  });
});

describe('itemAgeAtStart', () => {
  it('is 0 for a new item', () => {
    expect(itemAgeAtStart('new', 2026, '2026-11-05')).toBe(0);
  });

  it('counts whole months from 1 January of the model year for a used item', () => {
    // ebike-007 (2023) on 6 Nov 2026: 3 years + 10 months = 46 (data-traps note).
    expect(itemAgeAtStart('fair', 2023, '2026-11-06')).toBe(46);
  });
});

describe('endEarly', () => {
  const delivered = { condition: 'new', usageValue: 0 } as const;

  it('buys out early in month 7 (card 8): the ending keeps every line of the price', () => {
    const result = endEarly(aino, ainoContext(), delivered, { kind: 'early_buy' }, '2027-05-20');
    expect(result).toMatchObject({
      ok: true,
      ending: { kind: 'early_buy', decidedOn: '2027-05-20', effectiveDate: '2027-06-05' },
    });
    expect(result.ok && result.ending.earlyExit?.buy.grossCents).toBe(418_982);
  });

  it('credits a handed-back item at the value it was inspected in', () => {
    const result = endEarly(
      aino,
      ainoContext(),
      delivered,
      { kind: 'early_hand_back', condition: 'good', usageValue: 1_200 },
      '2027-05-20'
    );
    // 1 200 km = 1 step, −2 %. Now: 389 000 × 0.80 × 0.85 × 0.98 = 259 229.6 → 259 230.
    // At the end: 389 000 × 0.40 × 0.85 × 0.98 = 129 614.8 → 129 615, still above the buyout.
    // 284 286 + 48 239 − 259 230 = 73 295; VAT 26 % = 19 056.7 → 19 057.
    expect(result.ok && result.ending.earlyExit?.valueNowCents).toBe(259_230);
    expect(result.ok && result.ending.earlyExit?.handBack).toMatchObject({
      netCents: 73_295,
      vatCents: 19_057,
    });
    expect(result.ok && result.ending.inspection).toEqual({ condition: 'good', usageValue: 1_200 });
  });

  it('refuses readings that are better than at delivery', () => {
    const better = { kind: 'early_hand_back', condition: 'good', usageValue: 0 } as const;
    const worn = { condition: 'good', usageValue: 500 } as const;
    expect(endEarly(aino, ainoContext(), worn, better, '2027-05-20')).toEqual({
      ok: false,
      reason: 'usage_went_down',
    });
  });

  it('refuses outside the term', () => {
    expect(endEarly(aino, ainoContext(), delivered, { kind: 'early_buy' }, '2029-11-05')).toEqual({
      ok: false,
      reason: 'term_over',
    });
  });
});
