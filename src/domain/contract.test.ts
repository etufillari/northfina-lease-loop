import { describe, expect, it } from 'vitest';
import { toLeaseTerms } from './contract';

describe('toLeaseTerms', () => {
  it('maps immutable signed values without consulting catalogue pricing', () => {
    expect(
      toLeaseTerms({
        id: 'contract-aino-1',
        assetId: 'ebike-003',
        customerId: 'cust-aino',
        startDate: '2026-11-05',
        termMonths: 36,
        monthlyNetCents: 10730,
        paymentDueDays: 14,
      })
    ).toEqual({
      contractId: 'contract-aino-1',
      assetId: 'ebike-003',
      customerId: 'cust-aino',
      startDate: '2026-11-05',
      termMonths: 36,
      monthlyNetCents: 10730,
      paymentDueDays: 14,
    });
  });

  it('rejects invalid engine handoff terms', () => {
    expect(() =>
      toLeaseTerms({
        id: 'c1',
        assetId: 'a1',
        customerId: 'u1',
        startDate: '2026-11-05',
        termMonths: 18,
        monthlyNetCents: 1000,
        paymentDueDays: 14,
      })
    ).toThrow('Unsupported lease term');
  });
});
