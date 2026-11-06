import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import type { CoefficientTable, PriceList } from '@/data/schemas';
import { maxDownPaymentCents, quoteFor, requiredDownPayment } from './pricing';
import { listPriceOn } from './price-list';

let table: CoefficientTable;
let priceLists: PriceList[];
beforeAll(async () => {
  table = await loadCoefficientTable();
  priceLists = await loadPriceLists();
});

describe('quoteFor', () => {
  it('reproduces scenario card 1: ebike-003, 36 months, no down payment', () => {
    const price = listPriceOn(priceLists, 'ebike-003', '2026-11-05');
    expect(price).toMatchObject({ ok: true, priceCents: 389_000, priceListVersion: 1 });

    const result = quoteFor({
      listPriceCents: 389_000,
      downPaymentCents: 0,
      termMonths: 36,
      table,
    });
    expect(result).toMatchObject({
      ok: true,
      quote: {
        financedCents: 389_000,
        band: 'B',
        factorPpm: 27_584,
        monthlyNetRentCents: 10_730,
        buyoutNetCents: 58_350,
      },
    });
  });

  it('makes the months add up exactly to the net total, the last month taking the cents', () => {
    const result = quoteFor({
      listPriceCents: 389_000,
      downPaymentCents: 0,
      termMonths: 36,
      table,
    });
    if (!result.ok) throw new Error('expected a quote');
    const { monthlyNetRentCents, lastMonthNetRentCents, netTotalCents, termMonths } = result.quote;
    // 389000 × 0.027584 × 36 = 386 286.336 € cents, rounded half-up once.
    expect(netTotalCents).toBe(386_286);
    expect(lastMonthNetRentCents).toBe(10_736);
    expect(monthlyNetRentCents * (termMonths - 1) + lastMonthNetRentCents).toBe(netTotalCents);
  });

  it('prices the band-boundary laptops one band apart', () => {
    const bandA = quoteFor({ listPriceCents: 199_999, downPaymentCents: 0, termMonths: 36, table });
    const bandB = quoteFor({ listPriceCents: 200_000, downPaymentCents: 0, termMonths: 36, table });
    expect(bandA).toMatchObject({ ok: true, quote: { band: 'A', monthlyNetRentCents: 5_725 } });
    expect(bandB).toMatchObject({ ok: true, quote: { band: 'B', monthlyNetRentCents: 5_517 } });
  });

  it('subtracts the down payment before everything else', () => {
    const result = quoteFor({
      listPriceCents: 100_000,
      downPaymentCents: 30_000,
      termMonths: 24,
      table,
    });
    expect(result).toMatchObject({ ok: true, quote: { financedCents: 70_000, band: 'A' } });
  });

  it('rejects a down payment over 30 % of the list price', () => {
    expect(
      quoteFor({ listPriceCents: 100_000, downPaymentCents: 30_001, termMonths: 24, table })
    ).toEqual({ ok: false, reason: 'down_payment_over_max' });
  });

  it('rejects a negative down payment', () => {
    expect(
      quoteFor({ listPriceCents: 100_000, downPaymentCents: -1, termMonths: 24, table })
    ).toEqual({ ok: false, reason: 'down_payment_negative' });
  });

  it('cannot price ebike-010 on price list v1: under the €300 minimum even with no down payment', () => {
    const price = listPriceOn(priceLists, 'ebike-010', '2026-11-05');
    expect(price).toMatchObject({ ok: true, priceCents: 28_900 });
    expect(
      quoteFor({ listPriceCents: 28_900, downPaymentCents: 0, termMonths: 12, table })
    ).toEqual({ ok: false, reason: 'below_minimum' });
  });

  it('farm-006 is only financeable with a down payment that brings it under €250,000', () => {
    const over = quoteFor({
      listPriceCents: 26_000_000,
      downPaymentCents: 0,
      termMonths: 48,
      table,
    });
    expect(over).toEqual({ ok: false, reason: 'above_maximum' });

    const withDown = quoteFor({
      listPriceCents: 26_000_000,
      downPaymentCents: 1_000_000,
      termMonths: 48,
      table,
    });
    expect(withDown).toMatchObject({ ok: true, quote: { band: 'D', financedCents: 25_000_000 } });
  });

  it('rejects a term the coefficient table does not price', () => {
    expect(
      quoteFor({ listPriceCents: 389_000, downPaymentCents: 0, termMonths: 6, table })
    ).toEqual({ ok: false, reason: 'unknown_term' });
  });

  it('throws on fractional cents, because that is a caller bug', () => {
    expect(() =>
      quoteFor({ listPriceCents: 389_000.5, downPaymentCents: 0, termMonths: 36, table })
    ).toThrow(RangeError);
  });
});

describe('maxDownPaymentCents', () => {
  it('is 30 % of the list price when the €300 floor allows it', () => {
    expect(maxDownPaymentCents(100_000, table)).toBe(30_000);
  });

  it('shrinks to keep at least €300 financed', () => {
    expect(maxDownPaymentCents(40_000, table)).toBe(10_000);
  });

  it('is zero for an item already under the minimum', () => {
    expect(maxDownPaymentCents(28_900, table)).toBe(0);
  });
});

describe('requiredDownPayment', () => {
  it('asks nothing of a price inside the bands', () => {
    expect(requiredDownPayment(25_000_000, table)).toEqual({ needed: false });
  });

  it('the €260,000 combine needs €10,000 down: 4 % advertised (rounded up)', () => {
    expect(requiredDownPayment(26_000_000, table)).toEqual({
      needed: true,
      possible: true,
      minDownPaymentCents: 1_000_000,
      minPercent: 4,
    });
  });

  it('is impossible when even 30 % down leaves the price above the largest band', () => {
    // 30 % of €360,000 is €108,000; €252,000 is still above €250,000.
    expect(requiredDownPayment(36_000_000, table)).toEqual({ needed: true, possible: false });
  });

  it('a price exactly at the 30 % edge is still possible', () => {
    // €250,000 / 0.7 rounded down to whole cents: the cap exactly covers the overshoot.
    const edge = 35_714_285;
    const result = requiredDownPayment(edge, table);
    expect(result).toMatchObject({ needed: true, possible: true });
  });
});
