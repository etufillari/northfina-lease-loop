import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { quoteLease } from './pricing';

let table: CoefficientTable;
beforeAll(async () => {
  table = await loadCoefficientTable();
});

describe('quoteLease', () => {
  it('matches the worked example and updates for term and down payment', () => {
    expect(quoteLease(table, 389000, 0, 36)).toEqual({
      ok: true,
      financedCents: 389000,
      monthlyNetCents: 10730,
    });
    const reduced = quoteLease(table, 389000, 200000, 24);
    expect(reduced).toEqual({
      ok: true,
      financedCents: 189000,
      monthlyNetCents: Math.round(189000 * 0.036637),
    });
    expect(quoteLease(table, 389000, 0, 24)).not.toEqual(quoteLease(table, 389000, 0, 36));
  });
  it('prices the maximum 60-month term in every financing band', () => {
    expect(quoteLease(table, 389000, 0, 60)).toEqual({
      ok: true,
      financedCents: 389000,
      monthlyNetCents: 7444,
    });
    for (const band of table.bands) {
      expect(quoteLease(table, band.min_financed_cents, 0, 60).ok).toBe(true);
    }
    expect(table.end_of_term_buyout_percent_of_financed['60']).toBe(8);
  });
  it('rejects terms above 60 months even if a pricing table contains them', () => {
    const extendedTable = {
      ...table,
      bands: table.bands.map((band) => ({
        ...band,
        monthly_factor_by_term: { ...band.monthly_factor_by_term, '72': 0.015 },
      })),
    };
    for (const term of [61, 72]) {
      expect(quoteLease(extendedTable, 389000, 0, term)).toEqual({
        ok: false,
        reason: 'unknown_term',
      });
    }
  });
  it('handles band boundaries and financing limits', () => {
    for (const amount of [30000, 199999, 200000, 25000000]) {
      expect(quoteLease(table, amount, 0, 36).ok).toBe(true);
    }
    expect(quoteLease(table, 29999, 0, 36)).toEqual({ ok: false, reason: 'below_minimum' });
    expect(quoteLease(table, 25000001, 0, 36)).toEqual({ ok: false, reason: 'above_maximum' });
    expect(quoteLease(table, 389000, 389000, 36)).toEqual({ ok: false, reason: 'below_minimum' });
  });
  it('rejects invalid down payments and unknown terms', () => {
    for (const down of [-1, 389001]) {
      expect(quoteLease(table, 389000, down, 36)).toEqual({
        ok: false,
        reason: 'invalid_down_payment',
      });
    }
    expect(quoteLease(table, -1, 0, 36).ok).toBe(false);
    expect(quoteLease(table, 389000, 0, 18)).toEqual({ ok: false, reason: 'unknown_term' });
  });
  it('rejects fractional or unsafe cents', () => {
    expect(() => quoteLease(table, 100.5, 0, 36)).toThrow(RangeError);
    expect(() => quoteLease(table, 389000, 0.5, 36)).toThrow(RangeError);
    expect(() => quoteLease(table, Number.MAX_SAFE_INTEGER + 1, 0, 36)).toThrow(RangeError);
  });
});
