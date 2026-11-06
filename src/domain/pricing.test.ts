import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import type { CoefficientTable, PriceList } from '@/data/schemas';
import { listPriceOn } from './price-list';
import { downPaymentRange, leaseTerms, quoteLease, type QuoteInput } from './pricing';

let table: CoefficientTable;
let priceLists: PriceList[];
beforeAll(async () => {
  [table, priceLists] = await Promise.all([loadCoefficientTable(), loadPriceLists()]);
});

const priceOn = (assetId: string, isoDate: string) => {
  const result = listPriceOn(priceLists, assetId, isoDate);
  if (!result.ok) throw new Error(`no price for ${assetId}`);
  return result.priceCents;
};

const input = (overrides: Partial<QuoteInput>): QuoteInput => ({
  listPriceCents: 389_000,
  downPaymentCents: 0,
  termMonths: 36,
  vatPercent: 25.5,
  ...overrides,
});

describe('leaseTerms', () => {
  it('offers 12, 24, 36 and 48 months, shortest first', () => {
    expect(leaseTerms(table)).toEqual([12, 24, 36, 48]);
  });
});

describe('quoteLease', () => {
  it('reproduces the DATA.md worked example for ebike-003 exactly', () => {
    const result = quoteLease(input({ listPriceCents: priceOn('ebike-003', '2026-11-05') }), table);
    expect(result).toEqual({
      ok: true,
      quote: {
        listPriceCents: 389_000,
        downPaymentCents: 0,
        downPaymentVatCents: 0,
        downPaymentGrossCents: 0,
        financedCents: 389_000,
        termMonths: 36,
        band: 'B',
        annualInterestPercent: 7.9,
        factor: 0.027584,
        monthlyNetCents: 10_730,
        vatPercent: 25.5,
        monthlyVatCents: 2_736,
        monthlyGrossCents: 13_466,
        totalNetRentCents: 386_280,
        totalGrossRentCents: 484_776,
        buyoutPercent: 15,
        buyoutNetCents: 58_350,
      },
    });
  });

  it('takes the down payment off the financed amount', () => {
    const result = quoteLease(input({ downPaymentCents: 89_000 }), table);
    expect(result).toMatchObject({ ok: true, quote: { financedCents: 300_000 } });
  });

  it('moves band when the down payment crosses a band boundary', () => {
    // 389000 − 189001 = 199 999 → band A (higher interest); 189000 down → 200 000 → band B
    expect(quoteLease(input({ downPaymentCents: 189_001 }), table)).toMatchObject({
      ok: true,
      quote: { band: 'A', annualInterestPercent: 9.9 },
    });
    expect(quoteLease(input({ downPaymentCents: 189_000 }), table)).toMatchObject({
      ok: true,
      quote: { band: 'B' },
    });
  });

  it('keeps the two laptops either side of the band A/B boundary apart', () => {
    const a = quoteLease(input({ listPriceCents: priceOn('laptop-002', '2026-11-05') }), table);
    const b = quoteLease(input({ listPriceCents: priceOn('laptop-003', '2026-11-05') }), table);
    expect(a).toMatchObject({ ok: true, quote: { band: 'A' } });
    expect(b).toMatchObject({ ok: true, quote: { band: 'B' } });
  });

  it('uses the 26 % VAT rate when given it, without touching the net rent', () => {
    const now = quoteLease(input({ vatPercent: 25.5 }), table);
    const later = quoteLease(input({ vatPercent: 26 }), table);
    expect(now.ok && later.ok).toBe(true);
    if (now.ok && later.ok) {
      expect(later.quote.monthlyNetCents).toBe(now.quote.monthlyNetCents);
      expect(later.quote.monthlyVatCents).toBe(2_790); // 10730 × 26 % = 2789.8 → 2790
    }
  });

  it('refuses the e-bike that is too cheap to lease', () => {
    expect(
      quoteLease(input({ listPriceCents: priceOn('ebike-010', '2026-11-05') }), table)
    ).toEqual({ ok: false, reason: 'below_minimum' });
  });

  it('refuses the €260,000 machine with no down payment, and accepts it with €10,000', () => {
    const listPriceCents = priceOn('farm-006', '2026-11-05');
    expect(quoteLease(input({ listPriceCents }), table)).toEqual({
      ok: false,
      reason: 'above_maximum',
    });
    expect(quoteLease(input({ listPriceCents, downPaymentCents: 1_000_000 }), table)).toMatchObject(
      { ok: true, quote: { financedCents: 25_000_000, band: 'D' } }
    );
  });

  it('refuses a down payment that leaves too little to finance', () => {
    expect(quoteLease(input({ downPaymentCents: 359_001 }), table)).toEqual({
      ok: false,
      reason: 'below_minimum',
    });
  });

  it('refuses a down payment bigger than the price', () => {
    expect(quoteLease(input({ downPaymentCents: 389_001 }), table)).toEqual({
      ok: false,
      reason: 'down_payment_too_large',
    });
  });

  it('refuses a term that is not in the table', () => {
    expect(quoteLease(input({ termMonths: 30 }), table)).toEqual({
      ok: false,
      reason: 'unknown_term',
    });
  });

  it('throws on a fraction of a cent or a negative down payment', () => {
    expect(() => quoteLease(input({ downPaymentCents: 10.5 }), table)).toThrow(RangeError);
    expect(() => quoteLease(input({ downPaymentCents: -100 }), table)).toThrow(RangeError);
  });

  it('gives a valid quote at every term for every leasable price in the data pack', () => {
    for (const price of Object.values(priceLists[0]?.prices ?? {})) {
      const range = downPaymentRange(price, table);
      if (!range.ok) continue;
      for (const termMonths of leaseTerms(table)) {
        for (const downPaymentCents of [range.minCents, range.maxCents]) {
          const result = quoteLease(
            input({ listPriceCents: price, downPaymentCents, termMonths }),
            table
          );
          expect(result.ok, `${price} / ${downPaymentCents} / ${termMonths}`).toBe(true);
        }
      }
    }
  });
});

describe('downPaymentRange', () => {
  it('lets an ordinary e-bike go from €0 down to leaving €300 financed, in €10 steps', () => {
    expect(downPaymentRange(389_000, table)).toEqual({
      ok: true,
      minCents: 0,
      maxCents: 359_000,
      stepCents: 1_000,
    });
  });

  it('snaps the maximum down to a whole step so the slider never goes too far', () => {
    // 189 900 − 30 000 = 159 900 → 159 000 with €10 steps
    expect(downPaymentRange(189_900, table)).toMatchObject({ ok: true, maxCents: 159_000 });
  });

  it('requires €10,000 down on the €260,000 machine, in €1,000 steps', () => {
    expect(downPaymentRange(26_000_000, table)).toMatchObject({
      ok: true,
      minCents: 1_000_000,
      stepCents: 100_000,
    });
  });

  it('uses €100 steps between €10,000 and €100,000', () => {
    expect(downPaymentRange(2_390_000, table)).toMatchObject({ ok: true, stepCents: 10_000 });
  });

  it('allows only €0 down when the price is barely above the minimum', () => {
    expect(downPaymentRange(30_500, table)).toEqual({
      ok: true,
      minCents: 0,
      maxCents: 0,
      stepCents: 1_000,
    });
  });

  it('says an item below the smallest band cannot be leased', () => {
    expect(downPaymentRange(28_900, table)).toEqual({ ok: false, reason: 'below_minimum' });
    expect(downPaymentRange(30_000, table)).toMatchObject({ ok: true });
  });
});

describe('down payment VAT', () => {
  it('adds VAT to the (net) down payment, rounded once; the rent is unchanged', () => {
    const result = quoteLease(
      { listPriceCents: 389_000, downPaymentCents: 50_000, termMonths: 36, vatPercent: 25.5 },
      table
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.quote.financedCents).toBe(339_000);
    expect(result.quote.downPaymentVatCents).toBe(12_750);
    expect(result.quote.downPaymentGrossCents).toBe(62_750);
  });

  it('card 7: 20,000 € down on farm-002 carries 5,100 € VAT', () => {
    const result = quoteLease(
      { listPriceCents: 14_500_000, downPaymentCents: 2_000_000, termMonths: 48, vatPercent: 25.5 },
      table
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.quote.downPaymentVatCents).toBe(510_000);
  });

  it('no down payment, no VAT on it', () => {
    const result = quoteLease(
      { listPriceCents: 389_000, downPaymentCents: 0, termMonths: 36, vatPercent: 25.5 },
      table
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.quote.downPaymentGrossCents).toBe(0);
  });
});
