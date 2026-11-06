import { describe, expect, it } from 'vitest';
import { euroInputToCents } from './euro-input';

describe('euroInputToCents', () => {
  it('reads whole euros and one or two decimals, with a comma or a point', () => {
    expect(euroInputToCents('45')).toBe(4500);
    expect(euroInputToCents('45,5')).toBe(4550);
    expect(euroInputToCents('45.50')).toBe(4550);
    expect(euroInputToCents(' 0,99 ')).toBe(99);
  });

  it('is exact where floating point is not (0.29 × 100 = 28.999…)', () => {
    expect(euroInputToCents('0.29')).toBe(29);
    expect(euroInputToCents('1234567.89')).toBe(123_456_789);
  });

  it('refuses zero, negatives, three decimals, thousands separators and text', () => {
    for (const bad of ['0', '0,00', '-5', '4.555', '1 000', '1,000.00', 'abc', '', '12345678']) {
      expect(euroInputToCents(bad)).toBeNull();
    }
  });
});
