import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { parsePriceSelection } from './price-selection';

let table: CoefficientTable;
beforeAll(async () => {
  table = await loadCoefficientTable();
});

const EBIKE = 389_000; // down payment €0–€3,590 in €10 steps
const FARM_006 = 26_000_000; // needs at least €10,000 down, €1,000 steps

describe('parsePriceSelection', () => {
  it('defaults to 36 months and the smallest down payment', () => {
    expect(parsePriceSelection({}, EBIKE, table)).toEqual({ termMonths: 36, downPaymentCents: 0 });
    expect(parsePriceSelection({}, FARM_006, table)).toEqual({
      termMonths: 36,
      downPaymentCents: 1_000_000,
    });
  });

  it('keeps a valid term and down payment from the URL', () => {
    expect(parsePriceSelection({ term: '24', down: '50000' }, EBIKE, table)).toEqual({
      termMonths: 24,
      downPaymentCents: 50_000,
    });
  });

  it('ignores a term that is not offered', () => {
    expect(parsePriceSelection({ term: '30' }, EBIKE, table).termMonths).toBe(36);
    expect(parsePriceSelection({ term: 'abc' }, EBIKE, table).termMonths).toBe(36);
  });

  it('snaps the down payment to the slider step', () => {
    expect(parsePriceSelection({ down: '50499' }, EBIKE, table).downPaymentCents).toBe(50_000);
    expect(parsePriceSelection({ down: '50500' }, EBIKE, table).downPaymentCents).toBe(51_000);
  });

  it('clamps the down payment into the allowed range', () => {
    expect(parsePriceSelection({ down: '999999999' }, EBIKE, table).downPaymentCents).toBe(359_000);
    expect(parsePriceSelection({ down: '-5000' }, EBIKE, table).downPaymentCents).toBe(0);
    expect(parsePriceSelection({ down: '0' }, FARM_006, table).downPaymentCents).toBe(1_000_000);
  });

  it('falls back to the smallest down payment when it is unreadable', () => {
    expect(parsePriceSelection({ down: 'lots' }, FARM_006, table).downPaymentCents).toBe(1_000_000);
    expect(parsePriceSelection({ down: '' }, FARM_006, table).downPaymentCents).toBe(1_000_000);
  });

  it('uses the first value of a repeated key', () => {
    expect(parsePriceSelection({ term: ['12', '48'] }, EBIKE, table).termMonths).toBe(12);
  });

  it('gives no down payment for an item that cannot be leased', () => {
    expect(parsePriceSelection({ term: '24', down: '5000' }, 28_900, table)).toEqual({
      termMonths: 24,
      downPaymentCents: 0,
    });
  });
});
