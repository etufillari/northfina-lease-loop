// D11: the age of an item for the residual curve is counted in whole months from 1 January of
// its model year. Card 8 values card 1's 2026 bike in month 7 of the lease (June 2027).
import { describe, expect, it } from 'vitest';
import { ageInMonths, curveAgeInMonths, monthsBetween } from './age';

describe('ageInMonths (D11)', () => {
  it('a 2026 model on 2027-06-05 is 17 months old (card 8, month 7 of card 1)', () => {
    expect(ageInMonths(2026, '2027-06-05')).toBe(17);
  });

  it('a 2026 model on 2026-01-15 is 0 months old', () => {
    expect(ageInMonths(2026, '2026-01-15')).toBe(0);
  });

  it('counts a month from its first day: 1 Feb is one month, 31 Jan is still zero', () => {
    expect(ageInMonths(2026, '2026-01-31')).toBe(0);
    expect(ageInMonths(2026, '2026-02-01')).toBe(1);
  });

  it('ebike-007, a 2023 model, is 46 months old on 2026-11-06 (card 9)', () => {
    expect(ageInMonths(2023, '2026-11-06')).toBe(46);
  });

  it('a model year after the valuation day counts as new (age 0), not negative', () => {
    expect(ageInMonths(2027, '2026-11-05')).toBe(0);
  });

  it('throws on a malformed day or a model year that is not a whole year', () => {
    expect(() => ageInMonths(2026, '2027-6-5')).toThrow(RangeError);
    expect(() => ageInMonths(2026.5, '2027-06-05')).toThrow(RangeError);
  });
});

describe('monthsBetween', () => {
  it('counts whole months, a month ending the day before the same day of the month', () => {
    expect(monthsBetween('2026-11-05', '2027-06-04')).toBe(6);
    expect(monthsBetween('2026-11-05', '2027-06-05')).toBe(7);
  });

  it('is zero for the same day and for a day before the start', () => {
    expect(monthsBetween('2026-11-05', '2026-11-05')).toBe(0);
    expect(monthsBetween('2026-11-05', '2026-10-01')).toBe(0);
  });

  it('clamps a 31st start to shorter months: 31 Jan to 28 Feb is one month', () => {
    expect(monthsBetween('2026-01-31', '2026-02-27')).toBe(0);
    expect(monthsBetween('2026-01-31', '2026-02-28')).toBe(1);
  });
});

describe('curveAgeInMonths (D31, provisional)', () => {
  const card1 = { modelYear: 2026, leaseStart: '2026-11-05' };

  it('card 8: a first-life item is aged from its lease start: 7 months on 2027-06-05', () => {
    expect(curveAgeInMonths({ ...card1, previousLives: 0 }, '2027-06-05')).toBe(7);
    expect(curveAgeInMonths({ ...card1, previousLives: 0 }, '2027-06-04')).toBe(6);
  });

  it('an item with previous lives keeps D11, from 1 January of the model year', () => {
    expect(curveAgeInMonths({ ...card1, previousLives: 1 }, '2027-06-05')).toBe(17);
    // card 9's ebike-007, a 2023 model on its second life
    expect(
      curveAgeInMonths(
        { modelYear: 2023, previousLives: 1, leaseStart: '2026-11-06' },
        '2026-11-06'
      )
    ).toBe(46);
  });

  it('throws on a negative number of previous lives', () => {
    expect(() => curveAgeInMonths({ ...card1, previousLives: -1 }, '2027-06-05')).toThrow(
      RangeError
    );
  });
});
