import { describe, expect, it } from 'vitest';
import { endOfTerm } from './end-of-term';

const lease = { status: 'active', startDate: '2026-11-05', termMonths: 36 };

describe('endOfTerm', () => {
  it('ends on the day one month after the last payment, not before', () => {
    expect(endOfTerm(lease, '2029-11-04')).toEqual({ ended: false });
    expect(endOfTerm(lease, '2029-11-05')).toEqual({ ended: true, endDate: '2029-11-05' });
    expect(endOfTerm(lease, '2030-03-01')).toEqual({ ended: true, endDate: '2029-11-05' });
  });
  it('clamps a month-end start like every due date (card 4)', () => {
    const laptop = { ...lease, startDate: '2026-01-31', termMonths: 25 };
    expect(endOfTerm(laptop, '2028-02-29')).toEqual({ ended: true, endDate: '2028-02-29' });
  });
  it('only applies to active leases: a bought, returned or unsigned one has nothing to decide', () => {
    for (const status of ['bought', 'returned', 'completed', 'awaiting_signature'])
      expect(endOfTerm({ ...lease, status }, '2030-01-01')).toEqual({ ended: false });
  });
});
