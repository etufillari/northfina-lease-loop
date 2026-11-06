import * as hegel from '@hegeldev/hegel';
import * as gs from '@hegeldev/hegel/generators';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadCoefficientTable,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadVatRates,
} from '@/data/load';
import type {
  AssetCategory,
  AssetCondition,
  CoefficientTable,
  RefurbishmentCosts,
  ResidualCurves,
  UsageUnit,
  VatRates,
} from '@/data/schemas';
import {
  billedMonthsAsOf,
  calculateEarlyExit,
  checkReturnInspection,
  worseCondition,
  earlyExitForContract,
  type EarlyExitInput,
  outstandingBalanceCents,
} from './early-exit';
import { availableTermsFromTable, calculateContractQuote } from './contract-pricing';
import { addMonthsClamped, daysInMonth } from './invoice-schedule';
// Scenario card 1 / card 8: ebike-003, 36 months, no down payment, signed 5 Nov 2026.
// Net list price 389 000, band B (7.9 %), rent 10 730, buyout 58 350 (data/DATA.md).
const CARD_1 = {
  signedOn: '2026-11-05',
  termMonths: 36,
  monthlyNetRentCents: 10_730,
  buyoutNetCents: 58_350,
  annualInterestPercent: 7.9,
  firstListPriceCents: 389_000,
  category: 'e_bike',
  usage: { unit: 'km', value: 0 },
  usageAtStartValue: 0,
} as const;

async function cardInput(
  asOf: string,
  overrides: Partial<EarlyExitInput> = {}
): Promise<EarlyExitInput> {
  return {
    ...CARD_1,
    asOf,
    condition: 'good',
    refurbishmentRules: (await loadRefurbishmentCosts()).e_bike.fixed,
    residualCurves: await loadResidualCurves(),
    vatRates: await loadVatRates(),
    ...overrides,
  };
}

describe('billedMonthsAsOf', () => {
  it('counts the first row on the signing day', () => {
    expect(billedMonthsAsOf('2026-11-05', 36, '2026-11-05')).toBe(1);
  });

  it('counts a row on its due date and not a day earlier', () => {
    expect(billedMonthsAsOf('2026-11-05', 36, '2027-05-04')).toBe(6);
    expect(billedMonthsAsOf('2026-11-05', 36, '2027-05-05')).toBe(7);
  });

  it('is 0 before the lease starts', () => {
    expect(billedMonthsAsOf('2026-11-05', 36, '2026-11-04')).toBe(0);
  });

  it('stops at the term, however late the date is', () => {
    expect(billedMonthsAsOf('2026-11-05', 36, '2029-10-05')).toBe(36);
    expect(billedMonthsAsOf('2026-11-05', 36, '2040-01-01')).toBe(36);
  });

  it('clamps the due day in short months (31 January start)', () => {
    expect(billedMonthsAsOf('2027-01-31', 12, '2027-02-27')).toBe(1);
    expect(billedMonthsAsOf('2027-01-31', 12, '2027-02-28')).toBe(2);
  });

  it('rejects bad dates and terms', () => {
    expect(() => billedMonthsAsOf('5.11.2026', 36, '2027-05-05')).toThrow(RangeError);
    expect(() => billedMonthsAsOf('2026-11-05', 36, 'soon')).toThrow(RangeError);
    expect(() => billedMonthsAsOf('2026-11-05', 0, '2027-05-05')).toThrow(RangeError);
  });
});

describe('outstandingBalanceCents', () => {
  const base = {
    monthlyNetRentCents: 10_730,
    buyoutNetCents: 58_350,
    annualInterestPercent: 7.9,
  };

  it('is exactly the buyout when no months remain', () => {
    expect(outstandingBalanceCents({ ...base, remainingMonths: 0 })).toBe(58_350);
  });

  it('is about the financed amount at signing (388 992 against 389 000)', () => {
    expect(outstandingBalanceCents({ ...base, remainingMonths: 36 })).toBe(388_992);
  });

  it('is 330 666 with 29 months left (card 8)', () => {
    expect(outstandingBalanceCents({ ...base, remainingMonths: 29 })).toBe(330_666);
  });

  it('is the plain sum when the interest rate is 0', () => {
    expect(
      outstandingBalanceCents({ ...base, annualInterestPercent: 0, remainingMonths: 10 })
    ).toBe(10 * 10_730 + 58_350);
  });

  it('rejects values that are not whole cents, negative, or non-finite', () => {
    const ok = { ...base, remainingMonths: 5 };
    expect(() => outstandingBalanceCents({ ...ok, monthlyNetRentCents: 10.5 })).toThrow(RangeError);
    expect(() => outstandingBalanceCents({ ...ok, buyoutNetCents: -1 })).toThrow(RangeError);
    expect(() => outstandingBalanceCents({ ...ok, annualInterestPercent: -0.1 })).toThrow(
      RangeError
    );
    expect(() => outstandingBalanceCents({ ...ok, annualInterestPercent: Number.NaN })).toThrow(
      RangeError
    );
    expect(() => outstandingBalanceCents({ ...ok, remainingMonths: 2.5 })).toThrow(RangeError);
  });

  it('rejects a rate with more than two decimals, which has no exact basis-point value', () => {
    expect(() =>
      outstandingBalanceCents({ ...base, annualInterestPercent: 7.905, remainingMonths: 5 })
    ).toThrow(RangeError);
  });

  it('rounds an exact half cent up', () => {
    // 1200 % a year is 100 % a month, so one rent of 1 or 3 cents is worth exactly 0.5 or 1.5.
    const half = { buyoutNetCents: 0, annualInterestPercent: 1200, remainingMonths: 1 };
    expect(outstandingBalanceCents({ ...half, monthlyNetRentCents: 1 })).toBe(1);
    expect(outstandingBalanceCents({ ...half, monthlyNetRentCents: 3 })).toBe(2);
  });

  it('stays within a cent of the floating-point formula for every month and band rate', () => {
    for (const annualInterestPercent of [0, 4.9, 5.9, 6.9, 7.9, 9.9, 12.5]) {
      const r = annualInterestPercent / 12 / 100;
      for (let m = 0; m <= 48; m += 1) {
        let float = 58_350 / (1 + r) ** m;
        for (let i = 1; i <= m; i += 1) float += 10_730 / (1 + r) ** i;
        const exact = outstandingBalanceCents({
          ...base,
          annualInterestPercent,
          remainingMonths: m,
        });
        expect(Math.abs(exact - float)).toBeLessThanOrEqual(0.5 + 1e-6);
      }
    }
  });
});

describe('calculateEarlyExit', () => {
  it('prices scenario card 8: exit in month 7, good condition, 0 km', async () => {
    const quote = calculateEarlyExit(await cardInput('2027-05-05'));

    expect(quote.billedMonths).toBe(7);
    expect(quote.remainingMonths).toBe(29);
    expect(quote.nominalRemainingRentsCents).toBe(29 * 10_730);
    expect(quote.balanceCents).toBe(330_666);
    // 389 000 × 80 % (age 7: 82 % at 6, 70 % at 12) × 0.85 (good) = 264 520
    expect(quote.marketValue).toEqual({
      ageMonths: 7,
      curvePercent: 80,
      usageValue: 0,
      valueCents: 264_520,
    });
    // Under 15 000 km only the 45 € safety inspection is needed: credit 264 520 - 4 500.
    expect(quote.refurbishment.totalCents).toBe(4_500);
    expect(quote.returnCreditCents).toBe(260_020);

    expect(quote.buyout.netCents).toBe(330_666);
    // 330 666 - 260 020
    expect(quote.returnItem.netCents).toBe(70_646);
  });

  it('charges VAT at the rate on the exit date (26 % from 2027)', async () => {
    const quote = calculateEarlyExit(await cardInput('2027-05-05'));

    // 70 646 × 26 % = 18 367.96 -> 18 368
    expect(quote.returnItem.settlement).toMatchObject({
      buyoutNetCents: 70_646,
      vatRatePercent: 26,
      vatCents: 18_368,
      grossCents: 89_014,
    });
    // 330 666 × 26 % = 85 973.16 -> 85 973
    expect(quote.buyout.settlement).toMatchObject({ vatCents: 85_973, grossCents: 416_639 });
  });

  it('uses 25.5 % for an exit in 2026', async () => {
    const quote = calculateEarlyExit(await cardInput('2026-12-05'));
    expect(quote.buyout.settlement.vatRatePercent).toBe(25.5);
  });

  it('shows every line and the lines add up to the net amount', async () => {
    const quote = calculateEarlyExit(await cardInput('2027-05-05'));

    expect(quote.buyout.lines.map((l) => l.key)).toEqual([
      'remainingRents',
      'buyout',
      'interestNotCharged',
    ]);
    expect(quote.returnItem.lines.map((l) => l.key)).toEqual([
      'remainingRents',
      'buyout',
      'interestNotCharged',
      'returnCredit',
      'refurbishment',
    ]);
    // 29 × 10 730 = 311 170; + 58 350 buyout; - interest not charged = balance 330 666
    expect(quote.buyout.lines.map((l) => l.amountCents)).toEqual([311_170, 58_350, -38_854]);
    expect(quote.returnItem.lines.slice(-2)).toEqual([
      { key: 'returnCredit', amountCents: -264_520, params: { ageMonths: 7, usageValue: 0 } },
      { key: 'refurbishment', amountCents: 4_500, params: {} },
    ]);
    for (const option of [quote.buyout, quote.returnItem]) {
      expect(option.lines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(option.netCents);
    }
  });

  it('month 1: the whole term is still to come', async () => {
    const quote = calculateEarlyExit(await cardInput('2026-11-05'));

    expect(quote.billedMonths).toBe(1);
    expect(quote.remainingMonths).toBe(35);
    expect(quote.balanceCents).toBe(380_823);
    // 389 000 × 97 % (age 1) × 0.85 = 320 730.5, rounded half up to 320 731
    expect(quote.marketValue.valueCents).toBe(320_731);
    expect(quote.returnItem.netCents).toBe(380_823 - (320_731 - 4_500));
  });

  it('final month: the buyout option equals the end-of-term buyout and returning is free', async () => {
    const quote = calculateEarlyExit(await cardInput('2029-10-05'));

    expect(quote.billedMonths).toBe(36);
    expect(quote.remainingMonths).toBe(0);
    expect(quote.buyout.netCents).toBe(CARD_1.buyoutNetCents);
    expect(quote.buyout.lines.map((l) => l.amountCents)).toEqual([0, 58_350, 0]);
    expect(quote.returnItem.netCents).toBe(0);
  });

  it('after the term has ended: same as the final month', async () => {
    const final = calculateEarlyExit(await cardInput('2029-10-05'));
    const later = calculateEarlyExit(await cardInput('2031-03-01'));

    expect(later.billedMonths).toBe(36);
    expect(later.buyout.netCents).toBe(final.buyout.netCents);
    expect(later.returnItem.netCents).toBe(0);
  });

  it('one month before the end costs about the buyout plus one discounted rent', async () => {
    const quote = calculateEarlyExit(await cardInput('2029-09-05'));

    expect(quote.remainingMonths).toBe(1);
    // (10 730 + 58 350) / (1 + 0.079 / 12) = 68 628
    expect(quote.balanceCents).toBe(68_628);
  });

  it('never charges less than nothing: a returned item worth more than the balance is free', async () => {
    // Month 30, as new: 389 000 × 46 % = 178 940, more than the balance (about 120 000).
    const quote = calculateEarlyExit(await cardInput('2029-04-05', { condition: 'new' }));

    expect(quote.remainingMonths).toBe(6);
    expect(quote.marketValue.valueCents).toBeGreaterThan(quote.balanceCents);
    expect(quote.returnItem.netCents).toBe(0);
    const adjustment = quote.returnItem.lines.find((l) => l.key === 'returnAdjustment');
    expect(adjustment?.amountCents).toBeGreaterThan(0);
    expect(quote.returnItem.lines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(0);
  });

  it('never charges more than the rents still to come, even for a worthless item', async () => {
    const quote = calculateEarlyExit(await cardInput('2027-05-05', { firstListPriceCents: 1_000 }));

    expect(quote.returnItem.netCents).toBe(quote.nominalRemainingRentsCents);
    const adjustment = quote.returnItem.lines.find((l) => l.key === 'returnAdjustment');
    expect(adjustment?.amountCents).toBeLessThan(0);
    expect(quote.returnItem.lines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(
      quote.returnItem.netCents
    );
  });

  it('a worse condition costs more to return', async () => {
    const results: Record<AssetCondition, number> = {
      new: 0,
      like_new: 0,
      good: 0,
      fair: 0,
      poor: 0,
    };
    for (const condition of Object.keys(results) as AssetCondition[]) {
      results[condition] = calculateEarlyExit(
        await cardInput('2027-05-05', { condition })
      ).returnItem.netCents;
    }
    expect(results.new).toBeLessThanOrEqual(results.like_new);
    expect(results.like_new).toBeLessThanOrEqual(results.good);
    expect(results.good).toBeLessThanOrEqual(results.fair);
    expect(results.fair).toBeLessThanOrEqual(results.poor);
    expect(results.poor).toBeGreaterThan(results.new);
  });

  it('a returned item costs more to return the more it was used', async () => {
    const at = async (km: number) =>
      calculateEarlyExit(await cardInput('2027-05-05', { usage: { unit: 'km', value: km } }))
        .returnItem.netCents;
    expect(await at(2_000)).toBeGreaterThan(await at(0));
    expect(await at(9_000)).toBeGreaterThan(await at(2_000));
  });

  it('from 15 000 km a new battery is deducted and the item is valued as if at 0 km', async () => {
    const quote = calculateEarlyExit(
      await cardInput('2027-05-05', { usage: { unit: 'km', value: 15_000 } })
    );
    expect(quote.refurbishment.steps.map((s) => s.id)).toEqual([
      'battery_replacement',
      'safety_inspection',
    ]);
    expect(quote.marketValue).toMatchObject({ usageValue: 0, valueCents: 264_520 });
    // 264 520 - 35 000 - 4 500
    expect(quote.returnCreditCents).toBe(225_020);
    expect(quote.returnItem.netCents).toBe(330_666 - 225_020);
  });

  it('refurbishment never makes the credit negative', async () => {
    // A 10 € item is worth about 6.80 € at 7 months: the 45 € inspection only cancels it.
    const quote = calculateEarlyExit(await cardInput('2027-05-05', { firstListPriceCents: 1_000 }));
    expect(quote.returnCreditCents).toBe(0);
    const refurbishment = quote.returnItem.lines.find((l) => l.key === 'refurbishment');
    expect(refurbishment?.amountCents).toBe(quote.marketValue.valueCents);
  });

  it('rejects a usage at exit below the usage at the start', async () => {
    await expect(async () =>
      calculateEarlyExit(
        await cardInput('2027-05-05', {
          usage: { unit: 'km', value: 100 },
          usageAtStartValue: 200,
        })
      )
    ).rejects.toThrow(/below the usage at the start/);
    await expect(async () =>
      calculateEarlyExit(await cardInput('2027-05-05', { usageAtStartValue: -1 }))
    ).rejects.toThrow(RangeError);
  });

  it('rejects an exit date before the lease starts', async () => {
    await expect(async () => calculateEarlyExit(await cardInput('2026-11-04'))).rejects.toThrow(
      RangeError
    );
  });

  it('rejects a category without a residual curve', async () => {
    await expect(async () =>
      calculateEarlyExit(await cardInput('2027-05-05', { category: 'spaceship' as never }))
    ).rejects.toThrow(/No residual curve/);
  });

  it('holds its invariants in every month of the term and for every condition', async () => {
    const conditions: AssetCondition[] = ['new', 'like_new', 'good', 'fair', 'poor'];
    for (const condition of conditions) {
      let previousBalance = Number.POSITIVE_INFINITY;
      for (let month = 1; month <= CARD_1.termMonths; month += 1) {
        // The row of month n falls on the 5th: 2026-11-05 plus n - 1 months.
        const asOf = billedDate(month);
        const quote = calculateEarlyExit(await cardInput(asOf, { condition }));

        expect(quote.billedMonths).toBe(month);
        // The early-buyout price never goes up as time passes.
        expect(quote.balanceCents).toBeLessThanOrEqual(previousBalance);
        previousBalance = quote.balanceCents;
        // The return cost is between nothing and the rents still to come.
        expect(quote.returnItem.netCents).toBeGreaterThanOrEqual(0);
        expect(quote.returnItem.netCents).toBeLessThanOrEqual(quote.nominalRemainingRentsCents);
        // The lines always add up to the amount and the gross is net plus VAT.
        for (const option of [quote.buyout, quote.returnItem]) {
          expect(option.lines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(option.netCents);
          expect(option.settlement.grossCents).toBe(option.netCents + option.settlement.vatCents);
        }
      }
    }
  });
});

/** The due date of rent row `month` for the card 1 contract (signed on the 5th). */
function billedDate(month: number): string {
  const index = 10 + month - 1; // November 2026 is month index 10 of year 2026
  const year = 2026 + Math.floor(index / 12);
  const monthOfYear = (index % 12) + 1;
  return `${year}-${String(monthOfYear).padStart(2, '0')}-05`;
}

describe('earlyExitForContract', () => {
  async function card1(exitMonth: number, usageValue = 0) {
    const [coefficientTable, refurbishmentCosts, residualCurves, vatRates] = await Promise.all([
      loadCoefficientTable(),
      loadRefurbishmentCosts(),
      loadResidualCurves(),
      loadVatRates(),
    ]);
    const result = calculateContractQuote({
      listPriceCents: 389_000,
      priceListVersion: 1,
      downPaymentCents: 0,
      termMonths: 36,
      isoDate: '2026-11-05',
      coefficientTable,
      vatRates,
    });
    if (!result.ok) throw new Error('card 1 quote failed');
    return earlyExitForContract({
      quote: result.quote,
      signedOn: '2026-11-05',
      exitMonth,
      inspection: { condition: 'good', usageValue },
      asset: { category: 'e_bike', usage: { unit: 'km', value: 0 } },
      refurbishmentCosts,
      residualCurves,
      vatRates,
    });
  }

  it('prices card 8 from the signed contract: month 7 is the rent row of 5 May 2027', async () => {
    const quote = await card1(7);
    expect(quote.asOf).toBe('2027-05-05');
    expect(quote.remainingMonths).toBe(29);
    expect(quote.buyout.netCents).toBe(330_666);
    expect(quote.returnItem.netCents).toBe(70_646);
  });

  it('values the item at the inspected usage, not the reading from the start of the lease', async () => {
    // 6 000 km: -12 % usage adjustment. 389 000 × 80 % × 0.85 × 0.88 = 232 777.6 -> 232 778
    const quote = await card1(7, 6_000);
    expect(quote.marketValue).toMatchObject({ usageValue: 6_000, valueCents: 232_778 });
    expect(quote.returnItem.netCents).toBe(330_666 - (232_778 - 4_500));
  });

  it('clamps a month past the term to the last rent row: the end-of-term buyout', async () => {
    const quote = await card1(99);
    expect(quote.asOf).toBe('2029-10-05');
    expect(quote.buyout.netCents).toBe(58_350);
  });

  it('rejects month 0 and fractional months', async () => {
    await expect(card1(0)).rejects.toThrow(RangeError);
    await expect(card1(1.5)).rejects.toThrow(RangeError);
  });
});

describe('checkReturnInspection', () => {
  const recorded = { condition: 'good', usageValue: 1_200 } as const;

  it('accepts the same or a worse condition and the same or a higher reading', () => {
    expect(checkReturnInspection(recorded, { condition: 'good', usageValue: 1_200 })).toEqual({
      ok: true,
    });
    expect(checkReturnInspection(recorded, { condition: 'poor', usageValue: 9_000 })).toEqual({
      ok: true,
    });
  });

  it('rejects a reading below the one recorded at the start of the lease', () => {
    expect(checkReturnInspection(recorded, { condition: 'good', usageValue: 1_199 })).toEqual({
      ok: false,
      problem: 'usage_decreased',
    });
  });

  it('rejects an item that comes back in better condition than it left in', () => {
    expect(checkReturnInspection(recorded, { condition: 'like_new', usageValue: 1_200 })).toEqual({
      ok: false,
      problem: 'condition_improved',
    });
  });

  it('rejects a negative or fractional reading', () => {
    for (const usageValue of [-1, 1_250.5, Number.NaN]) {
      expect(checkReturnInspection(recorded, { condition: 'good', usageValue })).toEqual({
        ok: false,
        problem: 'invalid_usage',
      });
    }
  });
});

describe('worseCondition', () => {
  it('picks the worse of two conditions, in either order', () => {
    expect(worseCondition('good', 'new')).toBe('good');
    expect(worseCondition('new', 'good')).toBe('good');
    expect(worseCondition('poor', 'fair')).toBe('poor');
    expect(worseCondition('like_new', 'like_new')).toBe('like_new');
  });
});

describe('early-exit property tests (Hegel: Fair early exit)', () => {
  let coefficientTable: CoefficientTable;
  let refurbishmentCosts: RefurbishmentCosts;
  let residualCurves: ResidualCurves;
  let vatRates: VatRates;

  beforeAll(async () => {
    [coefficientTable, refurbishmentCosts, residualCurves, vatRates] = await Promise.all([
      loadCoefficientTable(),
      loadRefurbishmentCosts(),
      loadResidualCurves(),
      loadVatRates(),
    ]);
  });

  const validIsoDateGen = gs.composite<string>((tc) => {
    const year = tc.draw(gs.integers({ minValue: 2025, maxValue: 2029 }));
    const month = tc.draw(gs.integers({ minValue: 1, maxValue: 12 }));
    const maxDay = daysInMonth(year, month);
    const day = tc.draw(gs.integers({ minValue: 1, maxValue: maxDay }));
    const mStr = String(month).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    return `${year}-${mStr}-${dStr}`;
  });

  const assetDetailsGen = gs.composite<{
    category: AssetCategory;
    condition: AssetCondition;
    usage: { unit: UsageUnit; value: number };
    usageAtStartValue: number;
  }>((tc) => {
    const category = tc.draw(gs.sampledFrom<AssetCategory>(['e_bike', 'laptop', 'farm_machine']));
    const condition = tc.draw(
      gs.sampledFrom<AssetCondition>(['new', 'like_new', 'good', 'fair', 'poor'])
    );
    const unit: UsageUnit =
      category === 'e_bike' ? 'km' : category === 'laptop' ? 'battery_cycles' : 'engine_hours';
    const usageAtStartValue = tc.draw(gs.integers({ minValue: 0, maxValue: 10_000 }));
    const additionalUsage = tc.draw(gs.integers({ minValue: 0, maxValue: 40_000 }));
    const value = usageAtStartValue + additionalUsage;
    return { category, condition, usage: { unit, value }, usageAtStartValue };
  });

  it('property: billedMonthsAsOf is monotonic, stays within [0, termMonths], and matches installment dates', () =>
    hegel.test(
      (tc) => {
        const signedOn = tc.draw(validIsoDateGen);
        const termMonths = tc.draw(gs.integers({ minValue: 1, maxValue: 84 }));
        const m1 = tc.draw(gs.integers({ minValue: 0, maxValue: 100 }));
        const m2 = tc.draw(gs.integers({ minValue: m1, maxValue: 100 }));

        const asOf1 = addMonthsClamped(signedOn, m1);
        const asOf2 = addMonthsClamped(signedOn, m2);

        const billed1 = billedMonthsAsOf(signedOn, termMonths, asOf1);
        const billed2 = billedMonthsAsOf(signedOn, termMonths, asOf2);

        expect(billed1).toBeGreaterThanOrEqual(0);
        expect(billed1).toBeLessThanOrEqual(termMonths);
        expect(billed2).toBeGreaterThanOrEqual(0);
        expect(billed2).toBeLessThanOrEqual(termMonths);
        expect(billed2).toBeGreaterThanOrEqual(billed1);

        // Exact due date property
        const step = tc.draw(gs.integers({ minValue: 0, maxValue: termMonths - 1 }));
        const onDueDate = addMonthsClamped(signedOn, step);
        expect(billedMonthsAsOf(signedOn, termMonths, onDueDate)).toBe(step + 1);

        // Day before signing
        expect(billedMonthsAsOf(signedOn, termMonths, '2024-01-01')).toBe(0);
        // Far future date
        expect(billedMonthsAsOf(signedOn, termMonths, '2099-12-31')).toBe(termMonths);
      },
      { testCases: 200 }
    ));

  it('property: outstandingBalanceCents satisfies boundary conditions, monotonicity in months, and safe integer math', () =>
    hegel.test(
      (tc) => {
        const monthlyNetRentCents = tc.draw(gs.integers({ minValue: 0, maxValue: 50_000_000 }));
        const buyoutNetCents = tc.draw(gs.integers({ minValue: 0, maxValue: 50_000_000 }));
        const annualRateBp = tc.draw(gs.integers({ minValue: 0, maxValue: 3000 }));
        const annualInterestPercent = annualRateBp / 100;
        const remainingMonths = tc.draw(gs.integers({ minValue: 0, maxValue: 84 }));

        const balance = outstandingBalanceCents({
          monthlyNetRentCents,
          buyoutNetCents,
          annualInterestPercent,
          remainingMonths,
        });

        expect(Number.isSafeInteger(balance)).toBe(true);
        expect(balance).toBeGreaterThanOrEqual(0);

        // Boundary: 0 remaining months is exactly the buyout
        if (remainingMonths === 0) {
          expect(balance).toBe(buyoutNetCents);
        }

        // Zero interest identity: plain undiscounted sum
        if (annualInterestPercent === 0) {
          expect(balance).toBe(monthlyNetRentCents * remainingMonths + buyoutNetCents);
        }

        // Positive interest rate discounting: balance <= nominal sum
        const nominalSum = monthlyNetRentCents * remainingMonths + buyoutNetCents;
        expect(balance).toBeLessThanOrEqual(nominalSum);
        if (annualInterestPercent >= 5 && remainingMonths >= 12 && monthlyNetRentCents >= 10_000) {
          expect(balance).toBeLessThan(nominalSum);
        }

        // Monotonicity in remaining months:
        // balance(m+1) - balance(m) = (rent - r * buyout) / (1 + r)^(m+1).
        // If rent >= r * buyout, then balance is non-decreasing in remaining months.
        if (remainingMonths < 84) {
          const nextBalance = outstandingBalanceCents({
            monthlyNetRentCents,
            buyoutNetCents,
            annualInterestPercent,
            remainingMonths: remainingMonths + 1,
          });
          const rentOverhead =
            BigInt(monthlyNetRentCents) * 120_000n - BigInt(annualRateBp) * BigInt(buyoutNetCents);
          if (rentOverhead >= 0n) {
            expect(nextBalance).toBeGreaterThanOrEqual(balance);
            if (rentOverhead >= 120_000n * 5_000n) {
              expect(nextBalance).toBeGreaterThan(balance);
            }
          } else if (rentOverhead < -120_000n * 5_000n) {
            expect(nextBalance).toBeLessThanOrEqual(balance);
          }
        }
      },
      { testCases: 200 }
    ));

  it('property: Money that adds up — line items reconcile with net, and net + VAT equals gross', () =>
    hegel.test(
      (tc) => {
        const signedOn = tc.draw(validIsoDateGen);
        const termMonths = tc.draw(gs.integers({ minValue: 1, maxValue: 84 }));
        const elapsedMonths = tc.draw(gs.integers({ minValue: 0, maxValue: termMonths + 12 }));
        const asOf = addMonthsClamped(signedOn, elapsedMonths);

        const monthlyNetRentCents = tc.draw(gs.integers({ minValue: 0, maxValue: 50_000_000 }));
        const buyoutNetCents = tc.draw(gs.integers({ minValue: 0, maxValue: 50_000_000 }));
        const annualInterestPercent = tc.draw(
          gs.sampledFrom([0, 4.9, 5.9, 6.9, 7.9, 8.9, 9.9, 12.5])
        );
        const firstListPriceCents = tc.draw(gs.integers({ minValue: 1_000, maxValue: 50_000_000 }));
        const asset = tc.draw(assetDetailsGen);

        const quote = calculateEarlyExit({
          signedOn,
          asOf,
          termMonths,
          monthlyNetRentCents,
          buyoutNetCents,
          annualInterestPercent,
          firstListPriceCents,
          category: asset.category,
          condition: asset.condition,
          usage: asset.usage,
          usageAtStartValue: asset.usageAtStartValue,
          refurbishmentRules: refurbishmentCosts[asset.category].fixed,
          residualCurves,
          vatRates,
        });

        // Billed + remaining partition
        expect(quote.billedMonths + quote.remainingMonths).toBe(termMonths);
        expect(quote.nominalRemainingRentsCents).toBe(monthlyNetRentCents * quote.remainingMonths);

        // Buyout option
        expect(quote.buyout.netCents).toBe(quote.balanceCents);
        const buyoutLineSum = quote.buyout.lines.reduce((s, l) => s + l.amountCents, 0);
        expect(buyoutLineSum).toBe(quote.buyout.netCents);
        expect(quote.buyout.settlement.grossCents).toBe(
          quote.buyout.netCents + quote.buyout.settlement.vatCents
        );
        expect(quote.buyout.settlement.vatCents).toBe(
          Math.round(quote.buyout.netCents * (quote.buyout.settlement.vatRatePercent / 100))
        );

        // Return option
        const returnLineSum = quote.returnItem.lines.reduce((s, l) => s + l.amountCents, 0);
        expect(returnLineSum).toBe(quote.returnItem.netCents);
        expect(quote.returnItem.settlement.grossCents).toBe(
          quote.returnItem.netCents + quote.returnItem.settlement.vatCents
        );
        expect(quote.returnItem.settlement.vatCents).toBe(
          Math.round(quote.returnItem.netCents * (quote.returnItem.settlement.vatRatePercent / 100))
        );

        // Invariant: all lines have safe integer amounts
        for (const line of [...quote.buyout.lines, ...quote.returnItem.lines]) {
          expect(Number.isSafeInteger(line.amountCents)).toBe(true);
        }
      },
      { testCases: 200 }
    ));

  it('property: fair early exit math — early return expenses are 0 if and only if return credit offsets balance', () =>
    hegel.test(
      (tc) => {
        const signedOn = tc.draw(validIsoDateGen);
        const termMonths = tc.draw(gs.integers({ minValue: 1, maxValue: 84 }));
        const elapsedMonths = tc.draw(gs.integers({ minValue: 0, maxValue: termMonths + 6 }));
        const asOf = addMonthsClamped(signedOn, elapsedMonths);

        const monthlyNetRentCents = tc.draw(gs.integers({ minValue: 0, maxValue: 50_000_000 }));
        const buyoutNetCents = tc.draw(gs.integers({ minValue: 0, maxValue: 50_000_000 }));
        const annualInterestPercent = tc.draw(
          gs.sampledFrom([0, 4.9, 5.9, 6.9, 7.9, 8.9, 9.9, 12.5])
        );
        const firstListPriceCents = tc.draw(gs.integers({ minValue: 1_000, maxValue: 50_000_000 }));
        const asset = tc.draw(assetDetailsGen);

        const quote = calculateEarlyExit({
          signedOn,
          asOf,
          termMonths,
          monthlyNetRentCents,
          buyoutNetCents,
          annualInterestPercent,
          firstListPriceCents,
          category: asset.category,
          condition: asset.condition,
          usage: asset.usage,
          usageAtStartValue: asset.usageAtStartValue,
          refurbishmentRules: refurbishmentCosts[asset.category].fixed,
          residualCurves,
          vatRates,
        });

        // 1. Return cost bounds
        expect(quote.returnItem.netCents).toBeGreaterThanOrEqual(0);
        expect(quote.returnItem.netCents).toBeLessThanOrEqual(quote.nominalRemainingRentsCents);
        expect(quote.returnItem.netCents).toBeLessThanOrEqual(quote.buyout.netCents);

        // 2. Exact early-exit expense condition:
        // A customer terminates without expenses (returnItem netCents = 0) if and only if
        // the return credit meets or exceeds the balance (or no rents remain).
        const rawReturn = quote.balanceCents - quote.returnCreditCents;
        if (rawReturn <= 0 || quote.remainingMonths === 0) {
          expect(quote.returnItem.netCents).toBe(0);
        } else {
          const expectedCost = Math.min(rawReturn, quote.nominalRemainingRentsCents);
          expect(quote.returnItem.netCents).toBe(expectedCost);
          if (expectedCost > 0) {
            expect(quote.returnItem.netCents).toBeGreaterThan(0);
          }
        }

        // 3. Buyout option never allows terminating without paying the balance
        if (quote.balanceCents > 0) {
          expect(quote.buyout.netCents).toBeGreaterThan(0);
        }
      },
      { testCases: 200 }
    ));

  it('property: asset condition and usage monotonicity — returning in worse condition or higher usage never decreases expenses', () =>
    hegel.test(
      (tc) => {
        const signedOn = tc.draw(validIsoDateGen);
        const termMonths = tc.draw(gs.integers({ minValue: 6, maxValue: 60 }));
        const elapsed = tc.draw(gs.integers({ minValue: 0, maxValue: termMonths - 1 }));
        const asOf = addMonthsClamped(signedOn, elapsed);
        const firstListPriceCents = tc.draw(
          gs.integers({ minValue: 100_000, maxValue: 10_000_000 })
        );
        const monthlyNetRentCents = tc.draw(gs.integers({ minValue: 5_000, maxValue: 500_000 }));
        const buyoutNetCents = tc.draw(gs.integers({ minValue: 10_000, maxValue: 1_000_000 }));
        const category = tc.draw(
          gs.sampledFrom<AssetCategory>(['e_bike', 'laptop', 'farm_machine'])
        );
        const unit: UsageUnit =
          category === 'e_bike' ? 'km' : category === 'laptop' ? 'battery_cycles' : 'engine_hours';
        const baseInput = {
          signedOn,
          asOf,
          termMonths,
          monthlyNetRentCents,
          buyoutNetCents,
          annualInterestPercent: 7.9,
          firstListPriceCents,
          category,
          usageAtStartValue: 0,
          refurbishmentRules: refurbishmentCosts[category].fixed,
          residualCurves,
          vatRates,
        };

        // Monotonicity across conditions: 'new' -> 'like_new' -> 'good' -> 'fair' -> 'poor'
        const conditionOrder: AssetCondition[] = ['new', 'like_new', 'good', 'fair', 'poor'];
        const i1 = tc.draw(gs.integers({ minValue: 0, maxValue: conditionOrder.length - 1 }));
        const i2 = tc.draw(gs.integers({ minValue: i1, maxValue: conditionOrder.length - 1 }));
        const c1 = conditionOrder[i1]!;
        const c2 = conditionOrder[i2]!;

        const q1 = calculateEarlyExit({
          ...baseInput,
          condition: c1,
          usage: { unit, value: 500 },
        });
        const q2 = calculateEarlyExit({
          ...baseInput,
          condition: c2,
          usage: { unit, value: 500 },
        });

        // Better condition has higher or equal market value
        expect(q1.marketValue.valueCents).toBeGreaterThanOrEqual(q2.marketValue.valueCents);
        // Worse condition has higher or equal return expenses
        expect(q2.returnItem.netCents).toBeGreaterThanOrEqual(q1.returnItem.netCents);

        // Monotonicity across usage
        const uVal1 = tc.draw(gs.integers({ minValue: 0, maxValue: 20_000 }));
        const uVal2 = tc.draw(gs.integers({ minValue: uVal1, maxValue: 50_000 }));
        const qUse1 = calculateEarlyExit({
          ...baseInput,
          condition: 'good',
          usage: { unit, value: uVal1 },
        });
        const qUse2 = calculateEarlyExit({
          ...baseInput,
          condition: 'good',
          usage: { unit, value: uVal2 },
        });

        if (qUse1.refurbishment.resetsUsage === qUse2.refurbishment.resetsUsage) {
          expect(qUse1.marketValue.valueCents).toBeGreaterThanOrEqual(qUse2.marketValue.valueCents);
          expect(qUse1.returnCreditCents).toBeGreaterThanOrEqual(qUse2.returnCreditCents);
          expect(qUse2.returnItem.netCents).toBeGreaterThanOrEqual(qUse1.returnItem.netCents);
        }
      },
      { testCases: 200 }
    ));

  it('property: earlyExitForContract prices contract timeline consistently, matching buyout at end of term', () =>
    hegel.test(
      (tc) => {
        const terms = availableTermsFromTable(coefficientTable);
        const termMonths = tc.draw(gs.sampledFrom(terms));
        const lowestFinanced = Math.min(...coefficientTable.bands.map((b) => b.min_financed_cents));
        const highestFinanced = Math.max(
          ...coefficientTable.bands.map((b) => b.max_financed_cents)
        );
        const financedCents = tc.draw(
          gs.integers({ minValue: lowestFinanced, maxValue: highestFinanced })
        );
        const downPaymentCents = tc.draw(gs.integers({ minValue: 0, maxValue: 5_000_000 }));
        const listPriceCents = financedCents + downPaymentCents;
        const signedOn = tc.draw(validIsoDateGen);

        const result = calculateContractQuote({
          listPriceCents,
          priceListVersion: 1,
          downPaymentCents,
          termMonths,
          isoDate: signedOn,
          coefficientTable,
          vatRates,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const { quote } = result;
        const asset = tc.draw(assetDetailsGen);

        // Month 1 early exit
        const exitM1 = earlyExitForContract({
          quote,
          signedOn,
          exitMonth: 1,
          inspection: { condition: asset.condition, usageValue: asset.usage.value },
          asset: {
            category: asset.category,
            usage: { unit: asset.usage.unit, value: asset.usageAtStartValue },
          },
          refurbishmentCosts,
          residualCurves,
          vatRates,
        });

        expect(exitM1.billedMonths).toBe(1);
        expect(exitM1.remainingMonths).toBe(termMonths - 1);

        // If zero down payment and worn condition ('good', 'fair', 'poor'), month 1 exit requires expenses
        if (
          downPaymentCents === 0 &&
          ['good', 'fair', 'poor'].includes(asset.condition) &&
          termMonths >= 24
        ) {
          expect(exitM1.returnItem.netCents).toBeGreaterThan(0);
        }

        // Final month early exit equals end of term
        const exitFinal = earlyExitForContract({
          quote,
          signedOn,
          exitMonth: termMonths,
          inspection: { condition: asset.condition, usageValue: asset.usage.value },
          asset: {
            category: asset.category,
            usage: { unit: asset.usage.unit, value: asset.usageAtStartValue },
          },
          refurbishmentCosts,
          residualCurves,
          vatRates,
        });

        expect(exitFinal.billedMonths).toBe(termMonths);
        expect(exitFinal.remainingMonths).toBe(0);
        // Exiting at the end of the term: buyout equals contractual buyout
        expect(exitFinal.buyout.netCents).toBe(quote.buyoutNetCents);
        // Returning at the end of the term costs 0 net euros
        expect(exitFinal.returnItem.netCents).toBe(0);

        // Timeline progression: balance strictly decreases between month 1 and final month (if term > 1)
        if (termMonths > 1) {
          expect(exitM1.balanceCents).toBeGreaterThan(exitFinal.balanceCents);
        }
      },
      { testCases: 200 }
    ));
});
