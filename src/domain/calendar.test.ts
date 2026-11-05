import { describe, expect, it } from 'vitest';
import { addDays } from './calendar';

describe('addDays', () => {
  it('moves within a month and across a month end', () => {
    expect(addDays('2026-11-05', 7)).toBe('2026-11-12');
    expect(addDays('2026-11-28', 7)).toBe('2026-12-05');
  });

  it('crosses a year end', () => {
    expect(addDays('2026-12-29', 7)).toBe('2027-01-05');
  });

  it('counts 29 February in a leap year and skips it otherwise', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('goes backwards with a negative number of days', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('throws on a malformed or impossible date, which is a bug', () => {
    expect(() => addDays('5.11.2026', 1)).toThrow(RangeError);
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => addDays('2026-11-05', 1.5)).toThrow(RangeError);
  });
});
