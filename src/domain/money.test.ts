import { describe, expect, it } from 'vitest';
import { formatEuro, roundedDivide } from './money';

// Intl uses no-break spaces; compare with plain spaces so the tests are readable.
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('roundedDivide', () => {
  it('rounds down below a half and up from a half', () => {
    expect(roundedDivide(1, 3)).toBe(0);
    expect(roundedDivide(2, 3)).toBe(1);
    expect(roundedDivide(1, 2)).toBe(1);
    expect(roundedDivide(3, 2)).toBe(2);
    expect(roundedDivide(5, 2)).toBe(3);
  });

  it('keeps exact results and zero unchanged', () => {
    expect(roundedDivide(10, 2)).toBe(5);
    expect(roundedDivide(0, 7)).toBe(0);
  });

  it('stays exact at the largest amount the coefficient table allows', () => {
    expect(roundedDivide(25_000_000 * 56_022, 1_000_000)).toBe(1_400_550);
  });

  it('rejects inputs that are not whole numbers, and a zero or negative divisor', () => {
    expect(() => roundedDivide(1.5, 2)).toThrow(RangeError);
    expect(() => roundedDivide(-1, 2)).toThrow(RangeError);
    expect(() => roundedDivide(1, 0)).toThrow(RangeError);
    expect(() => roundedDivide(1, 0.5)).toThrow(RangeError);
  });
});

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
