import { describe, expect, it } from 'vitest';
import { formatIsoDate, formatNumber, formatTimestamp } from './format';
import { getT, type MessageKey } from './get-t';
import { defaultLocale, isLocale, localeHref, locales } from './locales';

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

describe('localeHref (review finding 14)', () => {
  it('swaps the language and keeps the path and the query', () => {
    expect(localeHref('/fi/assets/ebike-003', 'en', '?quote=q-1&down=1000')).toBe(
      '/en/assets/ebike-003?quote=q-1&down=1000'
    );
    expect(localeHref('/fi/catalogue', 'sv', 'category=e_bike')).toBe(
      '/sv/catalogue?category=e_bike'
    );
  });

  it('the home page, and no query or a bare ?', () => {
    expect(localeHref('/fi', 'et')).toBe('/et');
    expect(localeHref('/fi/catalogue', 'en', '?')).toBe('/en/catalogue');
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

describe('getT with a key that is missing (review finding 8)', () => {
  it('returns the key itself instead of crashing the page', () => {
    const t = getT('fi');
    expect(t('exit.refusal.no_such_code' as MessageKey, { x: 1 })).toBe(
      'exit.refusal.no_such_code'
    );
    expect(t('demo.step.no_such_code' as MessageKey)).toBe('demo.step.no_such_code');
  });
});

describe('formatting', () => {
  it('formats ISO dates per locale without shifting the day', () => {
    expect(formatIsoDate('2026-11-06', 'en')).toBe('6 November 2026');
    expect(formatIsoDate('2026-11-06', 'fi')).toBe('6. marraskuuta 2026');
  });

  it('formats numbers per locale', () => {
    expect(formatNumber(18_400, 'en')).toBe('18,400');
    expect(plain(formatNumber(18_400, 'fi'))).toBe('18 400');
  });

  it('formats an instant in Helsinki time, so a UTC evening can be the next day', () => {
    expect(formatTimestamp('2026-11-05T14:30:00.000Z', 'en')).toBe('5 Nov 2026, 16:30');
    expect(plain(formatTimestamp('2026-11-05T22:30:00.000Z', 'en'))).toBe('6 Nov 2026, 00:30');
  });

  it('formats an instant per locale', () => {
    expect(plain(formatTimestamp('2026-11-05T14:30:00.000Z', 'fi'))).toContain('16.30');
  });
});
