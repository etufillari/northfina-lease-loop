import { describe, expect, it } from 'vitest';
import {
  applyFactor,
  factorToMicros,
  formatEuro,
  percentOf,
  percentToBasisPoints,
  roundHalfUp,
} from './money';

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
  it('rounds down below the half and up from the half', () => {
    expect(roundHalfUp(1049, 100)).toBe(10);
    expect(roundHalfUp(1050, 100)).toBe(11);
    expect(roundHalfUp(1051, 100)).toBe(11);
  });

  it('leaves exact divisions and zero alone', () => {
    expect(roundHalfUp(1000, 100)).toBe(10);
    expect(roundHalfUp(0, 100)).toBe(0);
  });

  it('rejects inputs that would make the answer unreliable', () => {
    expect(() => roundHalfUp(1.5, 2)).toThrow(RangeError);
    expect(() => roundHalfUp(-1, 2)).toThrow(RangeError);
    expect(() => roundHalfUp(1, 0)).toThrow(RangeError);
    expect(() => roundHalfUp(Number.MAX_SAFE_INTEGER + 1, 2)).toThrow(RangeError);
  });
});

describe('rate conversions', () => {
  it('turns data-pack rates into exact whole numbers', () => {
    expect(factorToMicros(0.027584)).toBe(27_584);
    expect(factorToMicros(0.056022)).toBe(56_022);
    expect(percentToBasisPoints(25.5)).toBe(2550);
    expect(percentToBasisPoints(26)).toBe(2600);
  });

  it('refuses rates that would silently lose precision', () => {
    expect(() => factorToMicros(0.0275845)).toThrow(RangeError);
    expect(() => percentToBasisPoints(25.555)).toThrow(RangeError);
    expect(() => percentToBasisPoints(-1)).toThrow(RangeError);
  });
});

describe('applyFactor', () => {
  it('matches the worked example in data/DATA.md', () => {
    expect(applyFactor(389_000, 0.027584)).toBe(10_730);
  });

  it('rounds an exact half cent up (farm-002 with 20 000 € down, 48 months)', () => {
    expect(applyFactor(12_500_000, 0.021763)).toBe(272_038);
  });
});

describe('percentOf', () => {
  it('matches the VAT in the worked example', () => {
    expect(percentOf(10_730, 25.5)).toBe(2736);
  });

  it('handles zero amounts and zero rates', () => {
    expect(percentOf(0, 25.5)).toBe(0);
    expect(percentOf(10_730, 0)).toBe(0);
  });
});
