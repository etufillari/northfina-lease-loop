import * as hegel from '@hegeldev/hegel';
import * as gs from '@hegeldev/hegel/generators';
import { describe, expect, it } from 'vitest';
import { formatEuro, parseEuroToCents } from './money';

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

describe('parseEuroToCents', () => {
  it('reads whole euros and one or two decimals, with comma or dot', () => {
    expect(parseEuroToCents('2500')).toBe(250_000);
    expect(parseEuroToCents('2500,5')).toBe(250_050);
    expect(parseEuroToCents('2500.50')).toBe(250_050);
    expect(parseEuroToCents('0,05')).toBe(5);
    expect(parseEuroToCents('0')).toBe(0);
  });

  it('is exact where a float would not be', () => {
    expect(parseEuroToCents('0.29')).toBe(29);
    expect(parseEuroToCents('1.15')).toBe(115);
    expect(parseEuroToCents('19.99')).toBe(1999);
  });

  it('ignores spaces used as thousands separators', () => {
    expect(parseEuroToCents('2 500,50')).toBe(250_050);
    expect(parseEuroToCents(' 12 000 ')).toBe(1_200_000);
  });

  it('rejects anything that is not a plain non-negative amount', () => {
    for (const bad of ['', 'abc', '-5', '1,234', '1.', '.5', '1,2,3', '1e3', '12€']) {
      expect(parseEuroToCents(bad), bad).toBeNull();
    }
  });

  it('rejects amounts too large to hold exactly', () => {
    expect(parseEuroToCents('9'.repeat(30))).toBeNull();
  });
});

describe('money property tests (Hegel)', () => {
  it('throws RangeError on any non-integer cents', () =>
    hegel.test((tc) => {
      const base = tc.draw(gs.integers({ minValue: -1_000_000_000, maxValue: 1_000_000_000 }));
      const frac = tc.draw(
        gs.floats({ minValue: 0.01, maxValue: 0.99, allowNan: false, allowInfinity: false })
      );
      const nonInt = base + frac;
      tc.assume(!Number.isInteger(nonInt));
      expect(() => formatEuro(nonInt, 'en')).toThrow(RangeError);
    }));

  it('formats any safe integer cents without throwing', () =>
    hegel.test((tc) => {
      const cents = tc.draw(gs.integers());
      const locale = tc.draw(gs.sampledFrom(['fi', 'en', 'sv', 'et', 'fi-FI', 'en-GB']));
      const result = formatEuro(cents, locale);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }));

  it('parseEuroToCents never crashes on arbitrary text input', () =>
    hegel.test((tc) => {
      const str = tc.draw(gs.text());
      const result = parseEuroToCents(str);
      if (result !== null) {
        expect(Number.isSafeInteger(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
      }
    }));

  it('accurately parses euro amounts with dot or comma without float error', () =>
    hegel.test((tc) => {
      const euros = tc.draw(gs.integers({ minValue: 0, maxValue: 10_000_000 }));
      const cents = tc.draw(gs.integers({ minValue: 0, maxValue: 99 }));
      const separator = tc.draw(gs.sampledFrom(['.', ',']));
      const centsStr = String(cents).padStart(2, '0');
      const input = `${euros}${separator}${centsStr}`;

      const parsed = parseEuroToCents(input);
      expect(parsed).toBe(euros * 100 + cents);
    }));

  it('round-trips formatEuro through parseEuroToCents for Finnish currency formatting', () =>
    hegel.test((tc) => {
      const cents = tc.draw(gs.integers({ minValue: 0, maxValue: 100_000_000_00 }));
      const formatted = formatEuro(cents, 'fi');
      const stripped = formatted.replace('€', '').trim();
      const parsed = parseEuroToCents(stripped);
      expect(parsed).toBe(cents);
    }));
});
