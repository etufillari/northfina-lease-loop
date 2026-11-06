import type { LeaseReader, ReturnLeaseRecord } from './types';

export function createMockLeaseReader(records: readonly ReturnLeaseRecord[]): LeaseReader {
  const leases = new Map(records.map((record) => [record.leaseId, record]));
  return {
    async readLease(leaseId) {
      return leases.get(leaseId);
    },
  };
}
