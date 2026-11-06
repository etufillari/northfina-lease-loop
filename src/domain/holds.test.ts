import { describe, expect, it } from 'vitest';
import {
  canRequestHold,
  checkHoldRequest,
  holdFits,
  holdStatusOn,
  MAX_HOLD_BUDGET_CENTS,
} from './holds';

const TERMS = [12, 24, 36, 48];

describe('canRequestHold', () => {
  it('lets a customer ask for an item that is leased or waiting for its check', () => {
    expect(canRequestHold({ status: 'leased', reservedFor: null }, 'cust-lena')).toBe(true);
    expect(canRequestHold({ status: 'returned', reservedFor: null }, 'cust-lena')).toBe(true);
    // Held for someone else for now: they can still ask, in case it's let go
    expect(canRequestHold({ status: 'returned', reservedFor: 'cust-aino' }, 'cust-lena')).toBe(
      true
    );
  });

  it('not for a free or sold item, a guest, or an item already held for them', () => {
    expect(canRequestHold({ status: 'available', reservedFor: null }, 'cust-lena')).toBe(false);
    expect(canRequestHold({ status: 'sold', reservedFor: null }, 'cust-lena')).toBe(false);
    expect(canRequestHold({ status: 'reserved', reservedFor: 'cust-aino' }, 'cust-lena')).toBe(
      false
    );
    expect(canRequestHold({ status: 'leased', reservedFor: null }, null)).toBe(false);
    expect(canRequestHold({ status: 'returned', reservedFor: 'cust-lena' }, 'cust-lena')).toBe(
      false
    );
  });
});

describe('checkHoldRequest', () => {
  const ok = { termMonths: 24, maxMonthlyCents: 9_000, minCondition: 'good' };

  it('accepts a term on offer, a whole-cent budget and a known condition', () => {
    expect(checkHoldRequest(ok, TERMS)).toBeNull();
    expect(checkHoldRequest({ ...ok, maxMonthlyCents: MAX_HOLD_BUDGET_CENTS }, TERMS)).toBeNull();
  });

  it('refuses anything else', () => {
    expect(checkHoldRequest({ ...ok, termMonths: 18 }, TERMS)).toBe('unknown_term');
    for (const cents of [0, -100, 90.5, MAX_HOLD_BUDGET_CENTS + 1, Number.NaN]) {
      expect(checkHoldRequest({ ...ok, maxMonthlyCents: cents }, TERMS), String(cents)).toBe(
        'invalid_budget'
      );
    }
    expect(checkHoldRequest({ ...ok, minCondition: 'shiny' }, TERMS)).toBe('unknown_condition');
  });
});

describe('holdFits', () => {
  const request = { maxMonthlyCents: 9_000, minCondition: 'good' as const };

  it('fits when the condition is good enough and the rent is within budget, both edges included', () => {
    expect(holdFits(request, { condition: 'good', monthlyGrossCents: 9_000 })).toEqual({
      fits: true,
      condition: true,
      budget: true,
    });
    expect(holdFits(request, { condition: 'like_new', monthlyGrossCents: 5_000 }).fits).toBe(true);
  });

  it('says which part doesn’t fit', () => {
    expect(holdFits(request, { condition: 'fair', monthlyGrossCents: 5_000 })).toEqual({
      fits: false,
      condition: false,
      budget: true,
    });
    expect(holdFits(request, { condition: 'good', monthlyGrossCents: 9_001 })).toEqual({
      fits: false,
      condition: true,
      budget: false,
    });
    // Can't be quoted at their term
    expect(holdFits(request, { condition: 'good', monthlyGrossCents: null }).budget).toBe(false);
  });
});

describe('holdStatusOn', () => {
  const request = { heldDate: '2027-10-01', withdrawnDate: '2027-10-10' };

  it('replays the dates', () => {
    expect(holdStatusOn(request, '2027-09-30')).toBe('waiting');
    expect(holdStatusOn(request, '2027-10-01')).toBe('held');
    expect(holdStatusOn(request, '2027-10-10')).toBe('withdrawn');
    expect(holdStatusOn({ heldDate: null, withdrawnDate: null }, '2030-01-01')).toBe('waiting');
    expect(holdStatusOn({ heldDate: null, withdrawnDate: '2027-01-01' }, '2027-01-01')).toBe(
      'withdrawn'
    );
  });
});
