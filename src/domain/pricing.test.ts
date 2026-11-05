import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { bandEdgeHint, downPaymentBounds, quoteLease } from './pricing';
import { DOWN_PAYMENT_STEP_CENTS } from './pricing-rules';

// Real data pack; every expected value is worked out by hand from it in the comments.
let table: CoefficientTable;
beforeAll(async () => {
  table = await loadCoefficientTable();
});

describe('quoteLease', () => {
  it('matches the DATA.md worked example: ebike-003, 36 months, no down payment', () => {
    // 389 000 × 0.027584 (band B, 36 m) = 10 730.176 → 10 730. Buyout 15 % of 389 000 = 58 350.
    // Rent over the term 36 × 10 730 = 386 280.
    expect(
      quoteLease(table, { listPriceCents: 389_000, termMonths: 36, downPaymentCents: 0 })
    ).toEqual({
      ok: true,
      financedCents: 389_000,
      band: 'B',
      factor: 0.027584,
      monthlyNetRentCents: 10_730,
      buyoutCents: 58_350,
      totalNetRentCents: 386_280,
      totalNetCostCents: 386_280,
    });
  });

  it('finances the list price minus the down payment (scenario card 7: farm-002)', () => {
    // 14 500 000 − 2 000 000 = 12 500 000, band D, 48 m factor 0.021763.
    // Rent 12 500 000 × 0.021763 = 272 037.5, an exact half → 272 038.
    // Buyout 8 % of 12 500 000 = 1 000 000. Total 48 × 272 038 + 2 000 000 = 15 057 824.
    expect(
      quoteLease(table, { listPriceCents: 14_500_000, termMonths: 48, downPaymentCents: 2_000_000 })
    ).toMatchObject({
      ok: true,
      financedCents: 12_500_000,
      band: 'D',
      monthlyNetRentCents: 272_038,
      buyoutCents: 1_000_000,
      totalNetRentCents: 13_057_824,
      totalNetCostCents: 15_057_824,
    });
  });

  it('can charge MORE rent for a bigger down payment at a band edge (data-pack rule)', () => {
    // 200 000 financed: band B, 200 000 × 0.027584 = 5 516.8 → 5 517.
    // 199 999 financed: band A, 199 999 × 0.028625 = 5 724.97 → 5 725.
    // Laptops laptop-002 (199 999) and laptop-003 (200 000) sit on exactly this edge.
    const bandB = quoteLease(table, {
      listPriceCents: 200_000,
      termMonths: 36,
      downPaymentCents: 0,
    });
    const bandA = quoteLease(table, {
      listPriceCents: 199_999,
      termMonths: 36,
      downPaymentCents: 0,
    });
    expect(bandB).toMatchObject({ ok: true, band: 'B', monthlyNetRentCents: 5_517 });
    expect(bandA).toMatchObject({ ok: true, band: 'A', monthlyNetRentCents: 5_725 });
  });

  it('rejects an item too cheap to lease (ebike-010, 289 € is under the 300 € minimum)', () => {
    expect(
      quoteLease(table, { listPriceCents: 28_900, termMonths: 12, downPaymentCents: 0 })
    ).toEqual({ ok: false, reason: 'below_minimum' });
  });

  it('rejects financing over 250 000 € (farm-006 at 260 000 € with no down payment)', () => {
    expect(
      quoteLease(table, { listPriceCents: 26_000_000, termMonths: 48, downPaymentCents: 0 })
    ).toEqual({ ok: false, reason: 'above_maximum' });
  });

  it('rejects a term the table has no factor for', () => {
    expect(
      quoteLease(table, { listPriceCents: 389_000, termMonths: 18, downPaymentCents: 0 })
    ).toEqual({ ok: false, reason: 'unknown_term' });
  });

  it('rejects a down payment that is negative, off the slider step or the whole price', () => {
    const quote = (downPaymentCents: number) =>
      quoteLease(table, { listPriceCents: 389_000, termMonths: 36, downPaymentCents });
    expect(quote(-DOWN_PAYMENT_STEP_CENTS)).toEqual({ ok: false, reason: 'down_payment_negative' });
    expect(quote(DOWN_PAYMENT_STEP_CENTS + 1)).toEqual({
      ok: false,
      reason: 'down_payment_off_step',
    });
    expect(quote(389_000)).toEqual({ ok: false, reason: 'down_payment_too_large' });
  });

  it('throws on fractional cents or months, which are bugs', () => {
    expect(() =>
      quoteLease(table, { listPriceCents: 389_000.5, termMonths: 36, downPaymentCents: 0 })
    ).toThrow(RangeError);
    expect(() =>
      quoteLease(table, { listPriceCents: 389_000, termMonths: 36.5, downPaymentCents: 0 })
    ).toThrow(RangeError);
  });
});

describe('downPaymentBounds', () => {
  it('lets the down payment go up to where 300 € is still financed, floored to the step', () => {
    // ebike-003: 389 000 − 30 000 = 359 000, already on a 1 000-cent step.
    expect(downPaymentBounds(table, 389_000)).toEqual({
      ok: true,
      minCents: 0,
      maxCents: 359_000,
      stepCents: DOWN_PAYMENT_STEP_CENTS,
    });
    // laptop-002: 199 999 − 30 000 = 169 999 → floored to 169 000.
    expect(downPaymentBounds(table, 199_999)).toMatchObject({ ok: true, maxCents: 169_000 });
  });

  it('requires a down payment when the price is above 250 000 € (farm-006)', () => {
    // 26 000 000 − 25 000 000 = 1 000 000 minimum, on step.
    expect(downPaymentBounds(table, 26_000_000)).toMatchObject({
      ok: true,
      minCents: 1_000_000,
      maxCents: 25_970_000,
    });
    // 25 000 500 − 25 000 000 = 500 → rounded UP to the next step, 1 000.
    expect(downPaymentBounds(table, 25_000_500)).toMatchObject({ ok: true, minCents: 1_000 });
  });

  it('has no valid down payment for an item under the 300 € minimum', () => {
    expect(downPaymentBounds(table, 28_900)).toEqual({ ok: false, reason: 'below_minimum' });
  });

  it('gives exactly the down payments that quoteLease accepts, for every slider position', () => {
    for (const price of [28_900, 30_000, 199_999, 389_000, 2_390_000, 26_000_000]) {
      const bounds = downPaymentBounds(table, price);
      for (let down = -DOWN_PAYMENT_STEP_CENTS; down <= price; down += DOWN_PAYMENT_STEP_CENTS) {
        const quote = quoteLease(table, {
          listPriceCents: price,
          termMonths: 24,
          downPaymentCents: down,
        });
        const inBounds = bounds.ok && down >= bounds.minCents && down <= bounds.maxCents;
        expect({ price, down, ok: quote.ok }).toEqual({ price, down, ok: inBounds });
      }
    }
  });
});

describe('bandEdgeHint', () => {
  it('tells the customer when one step less down payment lowers the rent (D-013)', () => {
    // laptop-003, 200 000, 36 m. 10 € down → 199 000 financed, band A: × 0.028625 = 5 696.4 → 5 696.
    // No down payment → 200 000, band B: × 0.027584 = 5 516.8 → 5 517. Saving 179/month.
    expect(
      bandEdgeHint(table, { listPriceCents: 200_000, termMonths: 36, downPaymentCents: 1_000 })
    ).toEqual({ downPaymentCents: 0, monthlyNetRentCents: 5_517, savingPerMonthCents: 179 });
  });

  it('finds the cheaper band several steps away, not just one step back', () => {
    // Found in the browser: laptop-003 with 20 € down → 198 000 financed, band A:
    // × 0.028625 = 5 667.75 → 5 668. No down payment → band B, 5 517. Saving 151/month.
    expect(
      bandEdgeHint(table, { listPriceCents: 200_000, termMonths: 36, downPaymentCents: 2_000 })
    ).toEqual({ downPaymentCents: 0, monthlyNetRentCents: 5_517, savingPerMonthCents: 151 });
  });

  it('says nothing away from a band edge, at zero down, or for an invalid quote', () => {
    const hint = (downPaymentCents: number, listPriceCents = 389_000) =>
      bandEdgeHint(table, { listPriceCents, termMonths: 36, downPaymentCents });
    expect(hint(10_000)).toBeNull();
    expect(hint(0)).toBeNull();
    expect(hint(0, 28_900)).toBeNull();
  });
});
