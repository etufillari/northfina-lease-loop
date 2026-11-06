import { describe, expect, it } from 'vitest';
import {
  formatDateInput,
  formatDateTime,
  formatIsoDate,
  formatNumber,
  parseDateInput,
} from './format';
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
    expect(formatIsoDate('2026-11-06', 'en')).toBe('06 Nov 2026');
    expect(formatIsoDate('2026-11-06', 'fi')).toBe('06 mar 2026');
    expect(formatIsoDate('2028-02-29', 'sv')).toBe('29 feb 2028');
  });

  it('formats short dates at a fixed width: two-digit day, three-letter month', () => {
    expect(formatIsoDate('2026-01-01', 'en')).toBe('01 Jan 2026');
    expect(formatIsoDate('2026-11-06', 'en')).toBe('06 Nov 2026');
    expect(formatIsoDate('2027-05-31', 'fi')).toBe('31 tou 2027');
    expect(formatIsoDate('2026-03-15', 'et')).toBe('15 mär 2026');
    for (const locale of locales) {
      for (let month = 1; month <= 12; month++) {
        const iso = `2026-${String(month).padStart(2, '0')}-09`;
        expect(formatIsoDate(iso, locale)).toMatch(/^09 \p{L}{3} 2026$/u);
      }
    }
  });

  it('shows a timestamp as the date and the Helsinki time', () => {
    // 22:30 UTC on 31 Dec is already New Year in Helsinki (UTC+2).
    expect(formatDateTime('2026-12-31T22:30:00Z', 'en')).toBe('01 Jan 2027 00:30');
    expect(formatDateTime('2026-07-01T09:05:00Z', 'fi')).toBe('01 hei 2026 12:05'); // UTC+3
  });

  it('typed dates are day first, in whatever separator', () => {
    expect(formatDateInput('2026-11-06')).toBe('06.11.2026');
    expect(formatDateInput('not a date')).toBe('');
    for (const typed of ['06.11.2026', '6.11.2026', '6/11/2026', '6-11-2026', ' 6 11 2026 ']) {
      expect(parseDateInput(typed)).toBe('2026-11-06');
    }
    expect(parseDateInput('29.02.2028')).toBe('2028-02-29');
    for (const bad of ['29.02.2027', '11/32/2026', '2026-11-06', '6.11.26', '', 'tomorrow']) {
      expect(parseDateInput(bad)).toBeNull();
    }
  });

  it('formats numbers per locale', () => {
    expect(formatNumber(18_400, 'en')).toBe('18,400');
    expect(plain(formatNumber(18_400, 'fi'))).toBe('18 400');
  });
});
