import { describe, expect, it } from 'vitest';
import { formatIsoDate, formatNumber, formatShortDate } from './format';
import { getT } from './get-t';
import { defaultLocale, isLocale, locales } from './locales';

const plain = (text: string) => text.replace(/\s/g, ' ');

describe('isLocale', () => {
  it('accepts the four app languages', () => {
    expect(locales.every(isLocale)).toBe(true);
    expect(isLocale(defaultLocale)).toBe(true);
  });

  it('rejects anything else, including other casing and regions', () => {
    expect(isLocale('de')).toBe(false);
    expect(isLocale('EN')).toBe(false);
    expect(isLocale('fi-FI')).toBe(false);
    expect(isLocale('')).toBe(false);
  });
});

describe('getT', () => {
  it('returns the message for the locale', () => {
    expect(getT('en')('catalogue.title')).toBe('Catalogue');
    expect(getT('fi')('catalogue.title')).toBe('Valikoima');
  });

  it('fills in {placeholders}', () => {
    expect(getT('en')('catalogue.itemCount', { count: 12 })).toBe('12 items');
  });

  it('leaves a placeholder visible when its value is missing', () => {
    expect(getT('en')('catalogue.itemCount', {})).toBe('{count} items');
  });
});

describe('formatting', () => {
  it('formats ISO dates per locale without shifting the day', () => {
    expect(formatIsoDate('2026-11-06', 'en')).toBe('6 November 2026');
    expect(formatIsoDate('2026-11-06', 'fi')).toBe('6. marraskuuta 2026');
  });

  it('formats short dates at a fixed width: two-digit day, three-letter month', () => {
    expect(formatShortDate('2026-01-01', 'en')).toBe('01 Jan 2026');
    expect(formatShortDate('2026-11-06', 'en')).toBe('06 Nov 2026');
    expect(formatShortDate('2027-05-31', 'fi')).toBe('31 tou 2027');
    expect(formatShortDate('2026-03-15', 'et')).toBe('15 mär 2026');
    for (const locale of locales) {
      for (let month = 1; month <= 12; month++) {
        const iso = `2026-${String(month).padStart(2, '0')}-09`;
        expect(formatShortDate(iso, locale)).toMatch(/^09 \p{L}{3} 2026$/u);
      }
    }
  });

  it('formats numbers per locale', () => {
    expect(formatNumber(18_400, 'en')).toBe('18,400');
    expect(plain(formatNumber(18_400, 'fi'))).toBe('18 400');
  });
});
