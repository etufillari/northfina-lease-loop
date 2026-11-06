import { describe, expect, it } from 'vitest';
import { decimalRatio, roundRatio, multiplyCents } from './money';
describe('exact minor-unit arithmetic', () => {
  it('converts data decimals and scientific notation exactly', () => {
    expect(decimalRatio(0.027584)).toEqual([27584n, 1000000n]);
    expect(decimalRatio(1e-7)).toEqual([1n, 10000000n]);
    expect(decimalRatio(1e21)).toEqual([1000000000000000000000n, 1n]);
  });
  it('rounds half up once and preserves golden prices', () => {
    expect(roundRatio(1n, 2n)).toBe(1);
    expect(multiplyCents(389000, 0.027584)).toBe(10730);
    expect(multiplyCents(100, 1.005)).toBe(101);
    expect(multiplyCents(0, 0.5)).toBe(0);
  });
  it('rejects invalid inputs and overflow', () => {
    for (const n of [-1, NaN, Infinity]) expect(() => decimalRatio(n)).toThrow();
    expect(() => roundRatio(1n, 0n)).toThrow();
    expect(() => roundRatio(-1n, 2n)).toThrow();
    expect(() => roundRatio(2n ** 60n, 1n)).toThrow();
    expect(() => multiplyCents(1.5, 0.5)).toThrow();
  });
});

it('separates optional buyout/down payment from the locked rent total', async () => {
  const { totalNetIfBought } = await import('./money');
  expect(totalNetIfBought(10730, 36, 0, 58350)).toBe(444630);
  expect(() => totalNetIfBought(10730, 36, -1, 58350)).toThrow();
});
