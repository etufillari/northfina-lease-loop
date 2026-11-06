import { describe, expect, it } from 'vitest';
import {
  ageOnDate,
  dateOfAge,
  isCalendarDate,
  parseEuroCents,
  validBusinessId,
} from './application-fields';

describe('application fields', () => {
  it('validates real calendar days including century leap-year boundaries', () => {
    for (const date of ['2000-02-29', '2024-02-29', '2026-11-05'])
      expect(isCalendarDate(date)).toBe(true);
    for (const date of [
      '1900-02-29',
      '2026-02-29',
      '2026-04-31',
      '0000-01-01',
      '2026-13-01',
      '2026-01-00',
      'not-a-date',
    ])
      expect(isCalendarDate(date)).toBe(false);
  });
  it('uses the supplied start date and documented leap birthday policy', () => {
    expect(ageOnDate('2008-11-06', '2026-11-05')).toBe(17);
    expect(ageOnDate('2008-11-06', '2026-11-06')).toBe(18);
    expect(ageOnDate('2008-02-29', '2026-02-28')).toBe(18);
    expect(ageOnDate('2027-01-01', '2026-11-05')).toBeNull();
    expect(ageOnDate('bad', '2026-11-05')).toBeNull();
  });
  it('checks business ID format, modulo-zero and forbidden modulo-one cases', () => {
    for (const id of ['0245458-3', '0112038-9', '1234567-1', '0000019-0'])
      expect(validBusinessId(id)).toBe(true);
    for (const id of ['1234567-8', '0000000-0', '0000006-0', '12345671', 'FI1234567-1'])
      expect(validBusinessId(id)).toBe(false);
  });
  it('parses euro inputs exactly to cents without floating-point arithmetic', () => {
    expect(parseEuroCents('0')).toBe(0);
    expect(parseEuroCents('12.34')).toBe(1234);
    expect(parseEuroCents('12,3')).toBe(1230);
    expect(parseEuroCents(' 0.01 ')).toBe(1);
    for (const amount of ['', '-1', '1e3', '1.234', '1,234.00', '9999999999999999999'])
      expect(parseEuroCents(amount)).toBeNull();
  });
});

describe('dateOfAge', () => {
  it('is the birthday on which the person reaches the age (Mikko turns 18 on 10 March 2027)', () => {
    expect(dateOfAge('2009-03-10', 18)).toBe('2027-03-10');
    expect(ageOnDate('2009-03-10', '2027-03-09')).toBe(17);
    expect(ageOnDate('2009-03-10', '2027-03-10')).toBe(18);
  });
  it('uses Feb 28 for Feb 29 birthdays in non-leap years, consistent with ageOnDate', () => {
    expect(dateOfAge('2008-02-29', 18)).toBe('2026-02-28');
    expect(ageOnDate('2008-02-29', '2026-02-28')).toBe(18);
    expect(ageOnDate('2008-02-29', '2026-02-27')).toBe(17);
    expect(dateOfAge('2008-02-29', 20)).toBe('2028-02-29');
  });
  it('rejects invalid input', () => {
    expect(dateOfAge('2009-02-30', 18)).toBeNull();
    expect(dateOfAge('2009-03-10', -1)).toBeNull();
    expect(dateOfAge('2009-03-10', 1.5)).toBeNull();
  });
});
