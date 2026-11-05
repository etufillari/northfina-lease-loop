import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { MAX_DOWN_PAYMENT_CENTS, monthlyRentFor, parseDownPaymentCents } from './monthly-rent';

let table: CoefficientTable;
beforeAll(async () => {
  table = await loadCoefficientTable();
});

describe('parseDownPaymentCents', () => {
  it.each([
    ['0', 0],
    ['.5', 50],
    ['125.7', 12_570],
    ['500000', MAX_DOWN_PAYMENT_CENTS],
  ])('parses %s euros into whole cents', (value, cents) => {
    expect(parseDownPaymentCents(value)).toBe(cents);
  });

  it.each(['', '-1', '500000.01', '1.234', 'abc'])('rejects invalid amount %s', (value) => {
    expect(parseDownPaymentCents(value)).toBeUndefined();
  });
});

describe('monthlyRentFor', () => {
  it('uses the financed amount, selected term factor, and rounds to cents', () => {
    expect(monthlyRentFor(table, 389_000, 50_000, 36)).toEqual({
      ok: true,
      monthlyRentCents: 9_351,
    });
  });

  it('returns zero for the 0-month default', () => {
    expect(monthlyRentFor(table, 389_000, 0, 0)).toEqual({ ok: true, monthlyRentCents: 0 });
  });

  it('returns zero when down payment equals or exceeds list price', () => {
    expect(monthlyRentFor(table, 189_900, 189_900, 24)).toEqual({
      ok: true,
      monthlyRentCents: 0,
    });
    expect(monthlyRentFor(table, 189_900, 500_000, 24)).toEqual({
      ok: true,
      monthlyRentCents: 0,
    });
  });

  it('reports missing prices and unsupported financed amounts or terms', () => {
    expect(monthlyRentFor(table, undefined, 0, 12)).toEqual({
      ok: false,
      reason: 'no_list_price',
    });
    expect(monthlyRentFor(table, 30_000, 1, 24)).toEqual({
      ok: false,
      reason: 'below_minimum',
    });
    expect(monthlyRentFor(table, 26_000_000, 0, 24)).toEqual({
      ok: false,
      reason: 'above_maximum',
    });
    expect(monthlyRentFor(table, 189_900, 0, 18)).toEqual({
      ok: false,
      reason: 'unknown_term',
    });
  });

  it('throws when given a fractional-cent amount', () => {
    expect(() => monthlyRentFor(table, 189_900.5, 0, 24)).toThrow(RangeError);
    expect(() => monthlyRentFor(table, 189_900, 0.5, 24)).toThrow(RangeError);
    expect(() => monthlyRentFor(table, 189_900, -1, 24)).toThrow(RangeError);
    expect(() => monthlyRentFor(table, -1, 0, 24)).toThrow(RangeError);
  });
});
