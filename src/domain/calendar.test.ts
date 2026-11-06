import { describe, expect, it } from 'vitest';
import { addDays, addMonthsAnchored, ageOn, isIsoDate } from './calendar';

describe('calendar policy', () => {
  it.each([
    ['2026-02-28', true],
    ['2026-02-29', false],
    ['2028-02-29', true],
    ['1900-02-29', false],
    ['2000-02-29', true],
    ['2026-04-30', true],
    ['2026-04-31', false],
    ['2026-00-01', false],
    ['2026-13-01', false],
    ['2026-01-00', false],
    ['2026-01-32', false],
    ['0000-01-01', false],
    ['0001-01-01', true],
    ['9999-12-31', true],
    ['10000-01-01', false],
    ['2026-1-01', false],
    ['2026/01/01', false],
    ['2026-01-01\n', false],
    [' 2026-01-01', false],
    ['2026-01-01 ', false],
    ['2026-01-01T00:00:00Z', false],
    ['', false],
  ])('validates %s', (value, expected) => expect(isIsoDate(value)).toBe(expected));

  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2026-01-31', 2, '2026-03-31'],
    ['2026-01-31', 25, '2028-02-29'],
    ['2026-11-05', 36, '2029-11-05'],
    ['2026-01-31', -1, '2025-12-31'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-03-31', 1, '2026-04-30'],
    ['2028-02-29', 12, '2029-02-28'],
    ['2026-01-31', 0, '2026-01-31'],
    ['0001-01-01', 1, '0001-02-01'],
  ])('anchors %s plus %s months', (date, offset, expected) => {
    expect(addMonthsAnchored(date, offset)).toBe(expected);
  });

  it.each([
    ['2026-11-05', 7, '2026-11-12'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2028-03-01', -1, '2028-02-29'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2026-11-05', 0, '2026-11-05'],
  ])('adds %s plus %s days', (date, offset, expected) => {
    expect(addDays(date, offset)).toBe(expected);
  });

  it.each([
    ['2008-11-06', '2026-11-05', 17],
    ['2008-11-06', '2026-11-06', 18],
    ['2008-11-06', '2026-11-07', 18],
    ['2008-02-29', '2026-02-28', 17],
    ['2008-02-29', '2026-03-01', 18],
    ['2008-02-29', '2028-02-28', 19],
    ['2008-02-29', '2028-02-29', 20],
    ['2008-11-06', '2008-11-06', 0],
  ])('calculates age on the supplied start date', (birth, on, expected) => {
    expect(ageOn(birth, on)).toBe(expected);
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects a non-integer or unsafe month offset: %s',
    (offset) => expect(() => addMonthsAnchored('2026-01-01', offset)).toThrow(RangeError)
  );

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY, 36601, -36601])(
    'rejects an invalid day offset: %s',
    (offset) => expect(() => addDays('2026-01-01', offset)).toThrow(RangeError)
  );

  it('rejects overflowing years when adding months', () => {
    expect(() => addMonthsAnchored('9999-12-01', 1)).toThrow(RangeError);
    expect(() => addMonthsAnchored('0001-01-01', -1)).toThrow(RangeError);
    expect(() => addMonthsAnchored('2026-01-01', Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  });

  it('rejects invalid dates in arithmetic and in either age input', () => {
    expect(() => addMonthsAnchored('2026-02-29', 1)).toThrow(RangeError);
    expect(() => addDays('2026-01-01\n', 1)).toThrow(RangeError);
    expect(() => ageOn('2008-02-30', '2026-11-05')).toThrow(RangeError);
    expect(() => ageOn('2008-02-29', '2026-02-29')).toThrow(RangeError);
  });
});
