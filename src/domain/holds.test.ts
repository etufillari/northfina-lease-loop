import { describe, expect, it } from 'vitest';
import {
  HOLD_DAYS,
  holdUntil,
  isLapsed,
  lapsesOn,
  QUOTE_VALID_DAYS,
  UNTIL_ITEM_READY,
} from './holds';

describe('hold lengths', () => {
  it('are the documented ones', () => {
    expect(HOLD_DAYS).toEqual({ approval: 7, signatory: 7, waitlistOffer: 3, nomination: 3 });
    expect(QUOTE_VALID_DAYS).toBe(1);
  });

  it('run through the last day, across a month end', () => {
    expect(holdUntil('approval', '2026-11-05')).toBe('2026-11-12');
    expect(holdUntil('waitlistOffer', '2026-11-30')).toBe('2026-12-03');
    expect(holdUntil('signatory', '2028-02-25')).toBe('2028-03-03'); // leap year
  });

  it('lapse only from the day after the last valid day', () => {
    expect(isLapsed('2026-11-12', '2026-11-12')).toBe(false);
    expect(isLapsed('2026-11-12', '2026-11-13')).toBe(true);
    expect(isLapsed('2026-11-12', '2026-11-11')).toBe(false);
    expect(lapsesOn('2026-12-31')).toBe('2027-01-01');
  });

  it('a hold waiting for the item to be ready never lapses on a date', () => {
    expect(isLapsed(UNTIL_ITEM_READY, '2099-12-31')).toBe(false);
  });
});
