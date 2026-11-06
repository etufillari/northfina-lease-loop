import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import type { CoefficientTable, PriceList } from '@/data/schemas';
import { contractEndDate, lockContract } from './contract';
import { calculateQuote, quoteFromPriceList, type AssetQuote } from './pricing';

let table: CoefficientTable;
let priceLists: PriceList[];
beforeAll(async () => {
  [table, priceLists] = await Promise.all([loadCoefficientTable(), loadPriceLists()]);
});

function listQuote(assetId: string, onDate: string): AssetQuote {
  const result = quoteFromPriceList(priceLists, table, {
    assetId,
    onDate,
    downPaymentCents: 0,
    termMonths: 36,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.quote;
}

const sign = (quote: AssetQuote, signedOn: string, startDate = signedOn) =>
  lockContract({
    quote,
    customerId: 'cust-aino',
    signedOn,
    startDate,
    accepted: quote,
    priceLists,
    table,
  });

describe('contractEndDate', () => {
  it('is the day before the same date after the term', () => {
    expect(contractEndDate('2026-11-05', 36)).toBe('2029-11-04');
    expect(contractEndDate('2026-01-31', 36)).toBe('2029-01-30');
    expect(contractEndDate('2026-01-01', 12)).toBe('2026-12-31');
  });
});

describe('lockContract', () => {
  it('locks the quoted price when the list has not changed', () => {
    const result = sign(listQuote('ebike-003', '2026-11-05'), '2026-11-05');
    expect(result).toMatchObject({
      ok: true,
      snapshot: {
        assetId: 'ebike-003',
        customerId: 'cust-aino',
        monthlyNetRentCents: 10_730,
        startDate: '2026-11-05',
        endDate: '2029-11-04',
        priceLock: { reason: 'price_unchanged_since_quote', lockedPriceListVersion: 1 },
      },
    });
  });

  it('asks the customer to confirm when the list dropped before signing (card 2)', () => {
    const result = sign(listQuote('laptop-004', '2026-11-05'), '2026-11-06');
    expect(result).toMatchObject({
      ok: false,
      reason: 'price_changed',
      repriced: { priceListVersion: 2, monthlyNetRentCents: 8857, quotedOn: '2026-11-06' },
    });
  });

  it('asks the customer to confirm when the list rose, so nobody pays more unseen', () => {
    const result = sign(listQuote('ebike-003', '2026-11-05'), '2026-11-06');
    expect(result).toMatchObject({
      ok: false,
      reason: 'price_changed',
      repriced: { listPriceCents: 408_400 },
    });
  });

  it('locks the new price once confirmed and records what changed (card 2)', () => {
    const quote = listQuote('laptop-004', '2026-11-05');
    const result = lockContract({
      quote,
      customerId: 'cust-aino',
      signedOn: '2026-11-06',
      startDate: '2026-11-06',
      accepted: { monthlyNetRentCents: 8857, buyoutNetCents: 48_165 },
      priceLists,
      table,
    });
    expect(result).toMatchObject({
      ok: true,
      snapshot: {
        priceListVersion: 2,
        monthlyNetRentCents: 8857,
        priceLock: {
          reason: 'list_price_changed_since_quote',
          quotedPriceListVersion: 1,
          lockedPriceListVersion: 2,
          quotedListPriceCents: 349_000,
          lockedListPriceCents: 321_100,
          quotedMonthlyNetRentCents: 9627,
          lockedMonthlyNetRentCents: 8857,
        },
      },
    });
  });

  it('notices a change in the buyout even if the rent is the same', () => {
    const quote = listQuote('laptop-004', '2026-11-06');
    const result = lockContract({
      quote,
      customerId: 'cust-aino',
      signedOn: '2026-11-06',
      startDate: '2026-11-06',
      accepted: { monthlyNetRentCents: quote.monthlyNetRentCents, buyoutNetCents: 1 },
      priceLists,
      table,
    });
    expect(result).toMatchObject({ ok: false, reason: 'price_changed' });
  });

  it('needs no confirmation when a new list keeps the same price', () => {
    const result = sign(listQuote('farm-001', '2026-11-05'), '2026-11-06');
    expect(result).toMatchObject({
      ok: true,
      snapshot: {
        priceListVersion: 2,
        priceLock: { reason: 'price_unchanged_since_quote', quotedPriceListVersion: 1 },
      },
    });
  });

  it('keeps a second-life price, which no price list can change', () => {
    const base = calculateQuote(table, {
      listPriceCents: 150_000,
      downPaymentCents: 0,
      termMonths: 24,
    });
    if (!base.ok) throw new Error(base.reason);
    const quote = {
      ...base.quote,
      assetId: 'ebike-007',
      quotedOn: '2026-11-05',
      priceListVersion: null,
    };
    expect(sign(quote, '2026-11-06')).toMatchObject({
      ok: true,
      snapshot: { listPriceCents: 150_000, priceListVersion: null },
    });
  });

  it('refuses when the price can no longer be calculated on the signing day', () => {
    const quote = listQuote('ebike-003', '2026-11-05');
    const result = lockContract({
      quote,
      customerId: 'cust-aino',
      signedOn: '2026-11-06',
      startDate: '2026-11-06',
      accepted: quote,
      priceLists: [],
      table,
    });
    expect(result).toEqual({ ok: false, reason: 'no_price_list_on_date' });
  });

  it('accepts a start date after signing but not before it', () => {
    const quote = listQuote('ebike-003', '2026-11-05');
    expect(sign(quote, '2026-11-05', '2026-12-01')).toMatchObject({
      ok: true,
      snapshot: { signedOn: '2026-11-05', startDate: '2026-12-01', endDate: '2029-11-30' },
    });
    expect(sign(quote, '2026-11-05', '2026-11-04')).toEqual({
      ok: false,
      reason: 'start_before_signing',
    });
  });

  it('refuses a signature dated before the quote', () => {
    expect(sign(listQuote('ebike-003', '2026-11-05'), '2026-11-04')).toEqual({
      ok: false,
      reason: 'signed_before_quote',
    });
  });

  it('throws on an impossible date', () => {
    expect(() => sign(listQuote('ebike-003', '2026-11-05'), '2026-02-30')).toThrow(RangeError);
  });
});
