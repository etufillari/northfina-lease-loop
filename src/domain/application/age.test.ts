import { describe, expect, it } from 'vitest';
import { ageOn, eligibleFrom } from './age';

describe('ageOn', () => {
  it('turns a year older on the birthday, not the day before', () => {
    expect(ageOn('2009-03-10', '2027-03-09')).toBe(17);
    expect(ageOn('2009-03-10', '2027-03-10')).toBe(18);
    expect(ageOn('2009-03-10', '2027-03-11')).toBe(18);
  });

  it('handles a date earlier in the year than the birthday', () => {
    expect(ageOn('1997-12-31', '2026-01-01')).toBe(28);
    expect(ageOn('1997-01-01', '2026-12-31')).toBe(29);
  });

  it('is zero on the day of birth and negative before it', () => {
    expect(ageOn('2026-11-05', '2026-11-05')).toBe(0);
    expect(ageOn('2026-11-05', '2026-11-04')).toBe(-1);
  });

  it('gives a leap-day birthday on 1 March in other years', () => {
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
  });

  it('gives a leap-day birthday on 29 February in a leap year', () => {
    expect(ageOn('2008-02-29', '2028-02-28')).toBe(19);
    expect(ageOn('2008-02-29', '2028-02-29')).toBe(20);
  });

  it('treats 2100 as a normal year and 2000 as a leap year', () => {
    expect(ageOn('2096-02-29', '2100-02-28')).toBe(3);
    expect(ageOn('2096-02-29', '2100-03-01')).toBe(4);
    expect(ageOn('1996-02-29', '2000-02-29')).toBe(4);
  });

  it('throws on a date that is not ISO, because that is a bug in the caller', () => {
    expect(() => ageOn('10.3.2009', '2027-03-10')).toThrow(RangeError);
    expect(() => ageOn('2009-03-10', 'today')).toThrow(RangeError);
  });
});

describe('eligibleFrom', () => {
  it('gives the date Mikko turns 18', () => {
    expect(eligibleFrom('2009-03-10', 18)).toBe('2027-03-10');
  });

  it('moves a leap-day birthday to 1 March in other years', () => {
    expect(eligibleFrom('2008-02-29', 18)).toBe('2026-03-01');
  });

  it('keeps a leap-day birthday in a leap year', () => {
    expect(eligibleFrom('2008-02-29', 20)).toBe('2028-02-29');
  });

  it('agrees with ageOn: not that age the day before, that age on the date', () => {
    for (const birth of ['2009-03-10', '2008-02-29', '2004-12-31', '2000-01-01']) {
      const date = eligibleFrom(birth, 18);
      expect(ageOn(birth, date)).toBe(18);
      const year = Number(date.slice(0, 4));
      const dayBefore = date.endsWith('-01-01')
        ? `${year - 1}-12-31`
        : date.endsWith('-03-01')
          ? `${year}-02-28`
          : date.endsWith('-03-10')
            ? `${year}-03-09`
            : `${year}-12-30`;
      expect(ageOn(birth, dayBefore)).toBe(17);
    }
  });
});
