import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { downPaymentRange } from './pricing';
import { parsePriceSelection, parseWholeEuroInput, settleDownPayment } from './price-selection';

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

  it('keeps a whole-euro down payment exactly, even between slider steps', () => {
    expect(parsePriceSelection({ down: '123400' }, EBIKE, table).downPaymentCents).toBe(123_400);
    expect(parsePriceSelection({ down: '2049900' }, FARM_006, table).downPaymentCents).toBe(
      2_049_900
    );
  });

  it('rounds a down payment with cents to whole euros, half up', () => {
    expect(parsePriceSelection({ down: '123449' }, EBIKE, table).downPaymentCents).toBe(123_400);
    expect(parsePriceSelection({ down: '123450' }, EBIKE, table).downPaymentCents).toBe(123_500);
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

describe('settleDownPayment', () => {
  it('keeps whole euros, rounds cents half up and clamps into the range', () => {
    const range = downPaymentRange(FARM_006, table);
    if (!range.ok) throw new Error('farm-006 should be leasable');
    expect(settleDownPayment(2_049_900, range)).toBe(2_049_900);
    expect(settleDownPayment(2_049_949, range)).toBe(2_049_900);
    expect(settleDownPayment(2_049_950, range)).toBe(2_050_000);
    expect(settleDownPayment(0, range)).toBe(1_000_000);
    expect(settleDownPayment(99_999_999, range)).toBe(range.maxCents);
  });
});

describe('parseWholeEuroInput', () => {
  it('reads whole euros, with zero cents written out or not', () => {
    expect(parseWholeEuroInput('20000')).toBe(2_000_000);
    expect(parseWholeEuroInput('1234')).toBe(123_400);
    expect(parseWholeEuroInput('1500,00')).toBe(150_000);
    expect(parseWholeEuroInput('1500.0')).toBe(150_000);
    expect(parseWholeEuroInput('0')).toBe(0);
  });

  it('ignores spaces used as thousands separators and a trailing euro sign', () => {
    expect(parseWholeEuroInput('20 000')).toBe(2_000_000);
    expect(parseWholeEuroInput('20\u00a0000 €')).toBe(2_000_000);
  });

  it('refuses cents and anything that is not an amount', () => {
    for (const text of ['1234,56', '1234.5', '0.10', '', ' ', '-5', 'abc', '1.234', '12e3']) {
      expect(parseWholeEuroInput(text)).toBeNull();
    }
  });
});
