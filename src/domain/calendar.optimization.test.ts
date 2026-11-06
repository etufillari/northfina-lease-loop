import { describe, expect, it } from 'vitest';
import { addDays } from './calendar';

describe('native UTC day arithmetic keeps the original contract', () => {
  it.each([
    ['0001-01-01', 1, '0001-01-02'],
    ['0099-12-31', 1, '0100-01-01'],
    ['1900-02-28', 1, '1900-03-01'],
    ['2000-02-28', 1, '2000-02-29'],
    ['2000-01-01', 36600, '2100-03-17'],
    ['2000-01-01', -36600, '1899-10-17'],
    ['2026-03-28', 2, '2026-03-30'],
    ['2026-10-24', 2, '2026-10-26'],
  ])('preserves calendar boundaries: %s plus %s days', (date, offset, expected) => {
    expect(addDays(date, offset)).toBe(expected);
  });

  it('still rejects output years outside the existing four-digit range', () => {
    expect(() => addDays('0001-01-01', -1)).toThrow('resulting year is outside 0001..9999');
    expect(() => addDays('9999-12-31', 1)).toThrow('resulting year is outside 0001..9999');
  });

  it('keeps offset validation before calendar-date validation', () => {
    expect(() => addDays('invalid', 36601)).toThrow(
      'day offset must be an integer between -36600 and 36600'
    );
  });
});
