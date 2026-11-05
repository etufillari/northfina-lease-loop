import { describe, expect, it } from 'vitest';
import { transitionLease } from './lifecycle';
import type { LeaseStatus, LeaseTerms } from './types';

const terms: LeaseTerms = {
  contractId: 'c1',
  assetId: 'a1',
  customerId: 'u1',
  startDate: '2026-01-31',
  termMonths: 12,
  monthlyNetCents: 10000,
  paymentDueDays: 14,
};

describe('lease transitions', () => {
  it('activates only on the agreed start', () => {
    expect(transitionLease(null, 'ACTIVATE', terms, terms.startDate)).toEqual({
      ok: true,
      value: 'ACTIVE',
    });
    expect(transitionLease(null, 'ACTIVATE', terms, '2026-02-01').ok).toBe(false);
  });
  it('completes at or after the exclusive end', () => {
    expect(transitionLease('ACTIVE', 'COMPLETE', terms, '2027-01-30')).toEqual({
      ok: false,
      reason: 'before_end_date',
    });
    expect(transitionLease('ACTIVE', 'COMPLETE', terms, '2027-01-31')).toEqual({
      ok: true,
      value: 'COMPLETED',
    });
    expect(transitionLease('ACTIVE', 'COMPLETE', terms, '2027-02-01').ok).toBe(true);
  });
  it('allows early termination at a period boundary only', () => {
    expect(transitionLease('ACTIVE', 'TERMINATE', terms, '2026-02-28')).toEqual({
      ok: true,
      value: 'TERMINATED',
    });
    for (const date of ['2026-02-15', '2025-12-31', '2027-01-31']) {
      expect(transitionLease('ACTIVE', 'TERMINATE', terms, date).ok).toBe(false);
    }
  });
  it('rejects invalid transitions, dates and terms', () => {
    for (const status of ['COMPLETED', 'TERMINATED'] as LeaseStatus[]) {
      for (const command of ['ACTIVATE', 'COMPLETE', 'TERMINATE'] as const) {
        expect(transitionLease(status, command, terms, terms.startDate).ok).toBe(false);
      }
    }
    expect(transitionLease('ACTIVE', 'ACTIVATE', terms, terms.startDate).ok).toBe(false);
    expect(transitionLease(null, 'COMPLETE', terms, terms.startDate).ok).toBe(false);
    expect(transitionLease(null, 'ACTIVATE', terms, 'bad').ok).toBe(false);
    expect(transitionLease(null, 'ACTIVATE', { ...terms, assetId: '' }, terms.startDate).ok).toBe(
      false
    );
  });
});
