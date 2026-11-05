import { describe, expect, it } from 'vitest';
import { formatEuro, roundHalfUp } from './money';

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

describe('roundHalfUp', () => {
  it('rounds the data pack worked example: rent 389 000 × 0.027584 = 10 730.176 → 10 730', () => {
    expect(roundHalfUp(389_000 * 0.027584)).toBe(10_730);
  });

  it('rounds the data pack worked example: VAT 10 730 × 25.5 % = 2 736.15 → 2 736', () => {
    expect(roundHalfUp((10_730 * 25.5) / 100)).toBe(2_736);
  });

  it('rounds an exact half up even when floats store it just below the half', () => {
    // By hand: 163 845 × 0.7 = 114 691.5 exactly; floats give 114 691.49999…
    expect(roundHalfUp(163_845 * (1 - 0.2 * 1.5))).toBe(114_692);
    // By hand: 1.005 € = 100.5 cents; floats give 100.49999…
    expect(roundHalfUp(1.005 * 100)).toBe(101);
  });

  it('rounds halves away from zero, so a credit note mirrors its invoice', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(-2.4)).toBe(-2);
  });

  it('leaves whole cents and zero unchanged', () => {
    expect(roundHalfUp(10_730)).toBe(10_730);
    expect(Object.is(roundHalfUp(0), 0)).toBe(true);
  });

  it('throws on NaN and infinity, which are bugs rather than amounts', () => {
    expect(() => roundHalfUp(Number.NaN)).toThrow(RangeError);
    expect(() => roundHalfUp(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
