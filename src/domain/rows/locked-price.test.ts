import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkLockedPrice, type LockedPrice } from './locked-price';

const issuesOf = (row: LockedPrice) => {
  const schema = z.custom<LockedPrice>().superRefine(checkLockedPrice);
  const result = schema.safeParse(row);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

const workedExample: LockedPrice = {
  quantity: 1,
  list_price_cents: 389000,
  down_payment_cents: 0,
  financed_cents: 389000,
  factor_millionths: 27584,
  monthly_net_cents: 10730,
};

describe('checkLockedPrice', () => {
  it('passes the worked example: 389 000 × 0.027584 = 10 730.18 → 10 730', () => {
    expect(issuesOf(workedExample)).toEqual([]);
  });

  it('passes card 7: 145 000 € less 20 000 € down, rent on the exact half cent 272 037.5 → 272 038', () => {
    // Band D, 48 months: 12 500 000 × 0.021763 = 272 037.5, an exact half cent.
    const card7 = {
      quantity: 1,
      list_price_cents: 14500000,
      down_payment_cents: 2000000,
      financed_cents: 12500000,
      factor_millionths: 21763,
      monthly_net_cents: 272038,
    };
    expect(issuesOf(card7)).toEqual([]);
    expect(issuesOf({ ...card7, monthly_net_cents: 272037 })).toEqual(['monthly_net_cents']);
  });

  it('names the down payment when it is above the price, and stops there', () => {
    expect(issuesOf({ ...workedExample, down_payment_cents: 389001, financed_cents: 0 })).toEqual([
      'down_payment_cents',
    ]);
  });

  it('names the financed amount when it does not follow from the price', () => {
    expect(issuesOf({ ...workedExample, financed_cents: 1 })).toEqual(['financed_cents']);
  });
});
