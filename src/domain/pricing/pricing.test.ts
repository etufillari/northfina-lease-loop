import { beforeAll, describe, expect, it } from 'vitest';
import { quoteSchema } from '@/data/lease-schemas';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { downPaymentLimits, quote, type QuoteInput } from './pricing';

let table: CoefficientTable;
beforeAll(async () => {
  table = await loadCoefficientTable();
});

const deal = (overrides: Partial<QuoteInput> = {}): QuoteInput => ({
  basePriceCents: 389_000,
  priceListVersion: 1,
  downPaymentCents: 0,
  termMonths: 36,
  ...overrides,
});

function rentFor(input: QuoteInput): number {
  const result = quote(table, input);
  if (!result.ok) throw new Error(`expected a quote, got ${result.reason}`);
  return result.quote.monthly_net_rent_cents;
}

describe('quote', () => {
  it('prices card 1: ebike-003 for 36 months with nothing down', () => {
    expect(quote(table, deal())).toEqual({
      ok: true,
      quote: {
        price_list_version: 1,
        base_price_cents: 389_000,
        down_payment_cents: 0,
        financed_cents: 389_000,
        term_months: 36,
        band: 'B',
        factor_micros: 27_584,
        annual_interest_basis_points: 790,
        monthly_net_rent_cents: 10_730,
        buyout_cents: 58_350,
      },
    });
  });

  it('produces a record that matches the quote schema', () => {
    const result = quote(table, deal());
    if (!result.ok) throw new Error(result.reason);
    expect(quoteSchema.safeParse(result.quote).success).toBe(true);
  });

  it('accepts a base price that has no price list', () => {
    expect(quote(table, deal({ priceListVersion: null }))).toMatchObject({
      ok: true,
      quote: { price_list_version: null },
    });
  });

  it('calculates rent and buyout from the financed amount', () => {
    expect(quote(table, deal({ downPaymentCents: 89_000 }))).toMatchObject({
      ok: true,
      quote: {
        financed_cents: 300_000,
        monthly_net_rent_cents: 8_275,
        buyout_cents: 45_000,
      },
    });
  });

  it('uses the buyout percent for each term', () => {
    const buyoutFor = (termMonths: number) => {
      const result = quote(table, deal({ termMonths }));
      return result.ok ? result.quote.buyout_cents : result.reason;
    };
    expect(buyoutFor(12)).toBe(155_600);
    expect(buyoutFor(24)).toBe(97_250);
    expect(buyoutFor(48)).toBe(31_120);
  });

  it('charges more on the cheaper side of a band boundary (laptop-002 and laptop-003)', () => {
    expect(rentFor(deal({ basePriceCents: 199_999 }))).toBe(5_725);
    expect(rentFor(deal({ basePriceCents: 200_000 }))).toBe(5_517);
  });

  it('moves to the higher band when 1 cent down crosses the boundary', () => {
    const noDown = rentFor(deal({ basePriceCents: 200_000 }));
    const oneCentDown = rentFor(deal({ basePriceCents: 200_000, downPaymentCents: 1 }));
    expect(oneCentDown).toBeGreaterThan(noDown);
  });

  it('allows ebike-010 on price list 2 up to exactly 300 cents down', () => {
    const v2 = { basePriceCents: 30_300, priceListVersion: 2 };
    expect(quote(table, deal({ ...v2, downPaymentCents: 300 })).ok).toBe(true);
    expect(quote(table, deal({ ...v2, downPaymentCents: 301 }))).toEqual({
      ok: false,
      reason: 'below_minimum',
    });
  });

  it('rejects ebike-010 on price list 1 as below the minimum', () => {
    expect(quote(table, deal({ basePriceCents: 28_900 }))).toEqual({
      ok: false,
      reason: 'below_minimum',
    });
  });

  it('rejects farm-006 until the down payment brings it to the maximum', () => {
    const farm = { basePriceCents: 26_000_000 };
    expect(quote(table, deal(farm))).toEqual({ ok: false, reason: 'above_maximum' });
    expect(quote(table, deal({ ...farm, downPaymentCents: 999_999 }))).toEqual({
      ok: false,
      reason: 'above_maximum',
    });
    expect(quote(table, deal({ ...farm, downPaymentCents: 1_000_000 })).ok).toBe(true);
  });

  it('rejects a term that is not in the table', () => {
    expect(quote(table, deal({ termMonths: 18 }))).toEqual({ ok: false, reason: 'unknown_term' });
  });

  it('rejects a term that has a factor but no buyout percent', () => {
    const noBuyout = { ...table, end_of_term_buyout_percent_of_financed: {} };
    expect(quote(noBuyout, deal())).toEqual({ ok: false, reason: 'unknown_term' });
  });

  it('rejects a down payment above the price, and treats paying it all as below minimum', () => {
    expect(quote(table, deal({ downPaymentCents: 389_001 }))).toEqual({
      ok: false,
      reason: 'down_payment_too_high',
    });
    expect(quote(table, deal({ downPaymentCents: 389_000 }))).toEqual({
      ok: false,
      reason: 'below_minimum',
    });
  });
});

describe('downPaymentLimits', () => {
  it('allows no down payment up to the table maximum for a normal price', () => {
    expect(downPaymentLimits(table, 389_000)).toEqual({
      ok: true,
      minCents: 0,
      maxCents: 359_000,
    });
  });

  it('requires a down payment for farm-006 (a price above the maximum)', () => {
    expect(downPaymentLimits(table, 26_000_000)).toEqual({
      ok: true,
      minCents: 1_000_000,
      maxCents: 25_970_000,
    });
  });

  it('leaves ebike-010 on price list 2 only 300 cents of room', () => {
    expect(downPaymentLimits(table, 30_300)).toEqual({ ok: true, minCents: 0, maxCents: 300 });
  });

  it('has exactly one valid down payment at the lowest price that can be financed', () => {
    expect(downPaymentLimits(table, 30_000)).toEqual({ ok: true, minCents: 0, maxCents: 0 });
  });

  it('says no down payment helps when the price is under the minimum', () => {
    expect(downPaymentLimits(table, 29_999)).toEqual({ ok: false, reason: 'below_minimum' });
    expect(downPaymentLimits(table, 0)).toEqual({ ok: false, reason: 'below_minimum' });
  });

  it('gives limits at which quote() works, and one cent beyond which it fails', () => {
    for (const price of [389_000, 26_000_000, 30_300]) {
      const limits = downPaymentLimits(table, price);
      if (!limits.ok) throw new Error('expected limits');
      const at = (downPaymentCents: number) =>
        quote(table, deal({ basePriceCents: price, downPaymentCents })).ok;
      expect(at(limits.minCents)).toBe(true);
      expect(at(limits.maxCents)).toBe(true);
      expect(at(limits.maxCents + 1)).toBe(false);
      if (limits.minCents > 0) expect(at(limits.minCents - 1)).toBe(false);
    }
  });

  it('rejects a price that is not whole cents', () => {
    expect(() => downPaymentLimits(table, 100.5)).toThrow(RangeError);
    expect(() => downPaymentLimits(table, -1)).toThrow(RangeError);
  });
});
