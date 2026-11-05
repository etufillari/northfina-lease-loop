import { describe, expect, it } from 'vitest';
import { AS_OF_COOKIE, asOf, asOfDate, asOfCookieOptions } from './as-of';

function jar(values: Record<string, string>) {
  return {
    get: (name: string) => (name in values ? { name, value: values[name]! } : undefined),
  };
}

// 10:00 UTC on 6 Nov 2026 is 12:00 the same day in Helsinki (UTC+2 in winter).
const friday = new Date('2026-11-06T10:00:00Z');

describe('asOf', () => {
  it('uses the demo date from the cookie', async () => {
    await expect(asOf(jar({ [AS_OF_COOKIE]: '2026-09-15' }), friday)).resolves.toEqual({
      date: '2026-09-15',
      realToday: '2026-11-06',
      isDemo: true,
    });
  });

  it('falls back to the real Helsinki date without a cookie', async () => {
    // 22:30 UTC on 5 Nov is already 6 Nov in Helsinki.
    await expect(asOf(jar({}), new Date('2026-11-05T22:30:00Z'))).resolves.toEqual({
      date: '2026-11-06',
      realToday: '2026-11-06',
      isDemo: false,
    });
  });

  it('ignores a cookie that is not a valid date in range', async () => {
    for (const value of ['2026-02-30', 'tomorrow', '2040-01-01']) {
      const result = await asOf(jar({ [AS_OF_COOKIE]: value }), friday);
      expect(result.date, value).toBe('2026-11-06');
      expect(result.isDemo, value).toBe(false);
    }
  });

  it('ignores other cookies', async () => {
    const result = await asOf(jar({ 'other-cookie': '2026-09-15' }), friday);
    expect(result.date).toBe('2026-11-06');
  });
});

describe('asOfDate', () => {
  it('returns just the effective date', async () => {
    await expect(asOfDate(jar({ [AS_OF_COOKIE]: '2026-01-31' }), friday)).resolves.toBe(
      '2026-01-31'
    );
  });
});

describe('asOfCookieOptions', () => {
  it('is readable by the server only, for the whole site, and not sent cross-site', () => {
    expect(asOfCookieOptions).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });
});
