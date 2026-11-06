import { describe, expect, it } from 'vitest';
import { euroInputToCents, euroInputToCentsClamped } from './euro-input';

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

describe('euroInputToCentsClamped', () => {
  const MAX = 10_000_000; // €100,000, the waiting-list API cap

  it('parses normal amounts exactly like euroInputToCents', () => {
    expect(euroInputToCentsClamped('45', MAX)).toBe(4500);
    expect(euroInputToCentsClamped('45,50', MAX)).toBe(4550);
  });

  it('clamps amounts above the cap instead of refusing them', () => {
    expect(euroInputToCentsClamped('900000', MAX)).toBe(MAX);
    expect(euroInputToCentsClamped('9000000', MAX)).toBe(MAX);
    expect(euroInputToCentsClamped('999999999999', MAX)).toBe(MAX);
    expect(euroInputToCentsClamped('100000', MAX)).toBe(MAX); // exactly the cap
    expect(euroInputToCentsClamped('99999,99', MAX)).toBe(9_999_999); // just under
  });

  it('still refuses malformed input and zero', () => {
    for (const bad of ['0', '-5', '4.555', '1,000.00', 'abc', '']) {
      expect(euroInputToCentsClamped(bad, MAX)).toBeNull();
    }
  });
});
