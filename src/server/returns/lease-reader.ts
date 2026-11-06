import type { PrismaClient } from '@/generated/prisma/client';
import { getLease } from '@/server/lease-engine/leases';
import type { LeaseReader } from './types';

export function createEngineLeaseReader(db: PrismaClient): LeaseReader {
  return {
    async readLease(leaseId) {
      try {
        const lease = await getLease(db, leaseId);
        return {
          leaseId: lease.leaseId,
          contractId: lease.contractId,
          assetId: lease.assetId,
          status: lease.status,
        };
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'NOT_FOUND'
        ) {
          return undefined;
        }
        throw error;
      }
    },
  };
}
