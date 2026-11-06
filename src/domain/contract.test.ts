import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  checkSignable,
  contractNumber,
  contractPeriod,
  contractStage,
  daysBetween,
  QUOTE_VALID_DAYS,
} from './contract';

describe('addMonths', () => {
  it('moves to the same day in a later month', () => {
    expect(addMonths('2026-11-05', 1)).toBe('2026-12-05');
    expect(addMonths('2026-11-05', 36)).toBe('2029-11-05');
  });

  it('clamps 31 January to the end of February (scenario card 4)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 25)).toBe('2028-02-29'); // 2028 is a leap year
  });

  it('crosses year ends in both directions', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2027-01-15', -1)).toBe('2026-12-15');
  });

  it('throws on a date that is not YYYY-MM-DD', () => {
    expect(() => addMonths('5.11.2026', 1)).toThrow(RangeError);
  });
});

describe('addDays and daysBetween', () => {
  it('count calendar days across months and leap days', () => {
    expect(addDays('2026-11-05', 14)).toBe('2026-11-19');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-11-05', '2026-11-06')).toBe(1);
    expect(daysBetween('2026-11-06', '2026-11-05')).toBe(-1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('contractPeriod', () => {
  it('ends the day before the same date term months later', () => {
    expect(contractPeriod('2026-11-05', 36)).toEqual({
      startDate: '2026-11-05',
      endDate: '2029-11-04',
    });
  });

  it('handles a start on the 31st', () => {
    expect(contractPeriod('2026-01-31', 1)).toEqual({
      startDate: '2026-01-31',
      endDate: '2026-02-27',
    });
  });
});

describe('checkSignable', () => {
  it('lets an approved quote from Thursday be signed on Friday (scenario card 2)', () => {
    expect(
      checkSignable({ decision: 'approved', quoteDate: '2026-11-05', signDate: '2026-11-06' })
    ).toEqual({ ok: true, quoteValidUntil: '2026-11-19' });
  });

  it(`keeps the quote valid for ${QUOTE_VALID_DAYS} days, both ends included`, () => {
    const check = (signDate: string) =>
      checkSignable({ decision: 'approved', quoteDate: '2026-11-05', signDate }).ok;
    expect(check('2026-11-05')).toBe(true);
    expect(check('2026-11-19')).toBe(true);
    expect(check('2026-11-20')).toBe(false);
  });

  it('says why an expired quote cannot be signed', () => {
    expect(
      checkSignable({ decision: 'approved', quoteDate: '2026-11-05', signDate: '2026-12-01' })
    ).toEqual({ ok: false, reason: 'quote_expired', quoteValidUntil: '2026-11-19' });
  });

  it('refuses applications that were not approved automatically', () => {
    for (const decision of ['manual_review', 'rejected']) {
      expect(
        checkSignable({ decision, quoteDate: '2026-11-05', signDate: '2026-11-05' })
      ).toMatchObject({ ok: false, reason: 'not_approved' });
    }
  });

  it('refuses a signing date before the quote', () => {
    expect(
      checkSignable({ decision: 'approved', quoteDate: '2026-11-05', signDate: '2026-11-04' })
    ).toMatchObject({ ok: false, reason: 'signed_before_quote' });
  });
});

describe('contractStage', () => {
  const lease = { startDate: '2026-11-05', endDate: '2029-11-04' };

  it('is not started before the first day', () => {
    expect(contractStage(lease, '2026-11-04')).toBe('not_started');
  });

  it('is active from the first to the last day, both included', () => {
    expect(contractStage(lease, '2026-11-05')).toBe('active');
    expect(contractStage(lease, '2029-11-04')).toBe('active');
  });

  it('has ended from the day after the last day', () => {
    expect(contractStage(lease, '2029-11-05')).toBe('ended');
  });
});

describe('contractNumber', () => {
  it('is the first 8 characters of the id in upper case', () => {
    expect(contractNumber('1a2b3c4d-0000-4000-8000-000000000000')).toBe('1A2B3C4D');
  });
});
