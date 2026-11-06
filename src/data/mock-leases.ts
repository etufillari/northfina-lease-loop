import type { LeaseTerms, LeaseStatus } from '@/domain/lease-engine/types';

export type MockLeaseRecord = Readonly<{
  signedDate: string;
  status: LeaseStatus;
  latestInvoicePaid: boolean;
  terms: LeaseTerms;
}>;

// TEMPORARY DEMO FIXTURE: delete this file and its account-page usage before merge
// once signed contracts/leases are persisted. This is not a real customer lease.
// latestInvoicePaid is mocked until invoice payment state is available from the engine.
export const mockLeaseRecords: readonly MockLeaseRecord[] = [
  {
    signedDate: '2026-11-05',
    status: 'ACTIVE',
    latestInvoicePaid: true,
    terms: {
      contractId: 'demo-contract-aino-ebike-003',
      assetId: 'ebike-003',
      customerId: 'cust-aino',
      startDate: '2026-11-05',
      termMonths: 36,
      monthlyNetCents: 10_730,
      paymentDueDays: 14,
    },
  },
  {
    signedDate: '2026-01-10',
    status: 'ACTIVE',
    latestInvoicePaid: true,
    terms: {
      contractId: 'demo-contract-aino-ebike-004',
      assetId: 'ebike-004',
      customerId: 'cust-aino',
      startDate: '2026-01-10',
      termMonths: 12,
      monthlyNetCents: 9_000,
      paymentDueDays: 14,
    },
  },
];
