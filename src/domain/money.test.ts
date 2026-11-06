import { describe, expect, it } from 'vitest';
import { formatEuro, multiplyCents, percentOfCents } from './money';

// Intl uses no-break spaces; compare with plain spaces so the tests are readable.
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('formatEuro', () => {
  it('formats Finnish style: space as thousands separator, comma decimals, € after', () => {
    expect(plain(formatEuro(189_900, 'fi'))).toBe('1 899,00 €');
    expect(plain(formatEuro(25_000_000, 'fi-FI'))).toBe('250 000,00 €');
  });

  it('formats English style: € first, comma thousands, dot decimals', () => {
    expect(formatEuro(189_900, 'en')).toBe('€1,899.00');
    expect(formatEuro(28_900, 'en-GB')).toBe('€289.00');
  });

  it('shows single cents and zero correctly', () => {
    expect(plain(formatEuro(5, 'fi'))).toBe('0,05 €');
    expect(formatEuro(0, 'en')).toBe('€0.00');
  });

  it('formats negative amounts such as credit notes', () => {
    expect(formatEuro(-1_250, 'en')).toBe('-€12.50');
  });

  it('throws on fractions of a cent', () => {
    expect(() => formatEuro(10.5, 'en')).toThrow(RangeError);
  });
});

describe('percentOfCents', () => {
  it('matches the DATA.md worked example: 25.5 % of 10730 → 2736', () => {
    expect(percentOfCents(10_730, 25.5)).toBe(2_736);
  });

  it('rounds exactly half a cent up and anything less down', () => {
    expect(percentOfCents(100, 25.5)).toBe(26); // 25.5 → 26
    expect(percentOfCents(2, 25)).toBe(1); // 0.5 → 1
    expect(percentOfCents(1, 25.5)).toBe(0); // 0.255 → 0
  });

  it('handles 0 %, 100 % and zero cents', () => {
    expect(percentOfCents(10_000, 0)).toBe(0);
    expect(percentOfCents(10_000, 100)).toBe(10_000);
    expect(percentOfCents(0, 25.5)).toBe(0);
  });

  it('throws on fractions of a cent and negative amounts', () => {
    expect(() => percentOfCents(10.5, 25.5)).toThrow(RangeError);
    expect(() => percentOfCents(-1, 25.5)).toThrow(RangeError);
  });
});

describe('multiplyCents', () => {
  it('matches the DATA.md worked example: 389000 × 0.027584 → 10730', () => {
    expect(multiplyCents(389_000, 0.027584)).toBe(10_730);
  });

  it('rounds exactly half a cent up, without floating-point drift', () => {
    // 500 × 0.001001 = 0.5005 → 1;  1000 × 0.0005 = 0.5 → 1;  1000 × 0.000499 = 0.499 → 0
    expect(multiplyCents(500, 0.001001)).toBe(1);
    expect(multiplyCents(1_000, 0.0005)).toBe(1);
    expect(multiplyCents(1_000, 0.000499)).toBe(0);
  });

  it('stays exact for the largest amount in the coefficient table', () => {
    // 25 000 000 × 0.053335 = 1 333 375 exactly
    expect(multiplyCents(25_000_000, 0.053335)).toBe(1_333_375);
  });

  it('keeps a factor with more than six decimals (an interpolated curve), so it rounds once', () => {
    // 14,500,000 × 0.3356789 = 4,867,344.05: six decimals (0.335679) would give 4,867,345.5 → 4,867,346
    expect(multiplyCents(14_500_000, 0.3356789)).toBe(4_867_344);
    // 549,000 × 0.2405 = 132,034.5 exactly → half up
    expect(multiplyCents(549_000, 0.37 * 0.65)).toBe(132_035);
  });

  it('throws on fractions of a cent and negative amounts', () => {
    expect(() => multiplyCents(0.5, 0.03)).toThrow(RangeError);
    expect(() => multiplyCents(100, -0.1)).toThrow(RangeError);
    expect(() => multiplyCents(100, Number.NaN)).toThrow(RangeError);
    expect(() => multiplyCents(-100, 0.03)).toThrow(RangeError);
  });
});
