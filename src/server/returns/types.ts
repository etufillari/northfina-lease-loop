import type { LeaseStatus } from '@/domain/lease-engine/types';
import type { AssetCondition, UsageUnit } from '@/data/schemas';

export type ReturnLeaseRecord = Readonly<{
  leaseId: string;
  contractId: string;
  assetId: string;
  status: LeaseStatus;
}>;

export type LeaseReader = Readonly<{
  readLease(leaseId: string): Promise<ReturnLeaseRecord | undefined>;
}>;

export type ReturnReceiptDTO = Readonly<{
  returnId: string;
  leaseId: string;
  assetId: string;
  status: 'REFURBISHMENT_PENDING' | 'READY';
  condition: AssetCondition;
  usage: Readonly<{ unit: UsageUnit; value: number }>;
  usageReductionEvidence: string | null;
  receivedOn: string;
  work: readonly Readonly<{
    workId: string;
    code: string;
    kind: 'condition_upgrade' | 'fixed';
    costCents: number;
    mandatory: boolean;
    resetsUsage: boolean;
    status: 'PENDING' | 'COMPLETED';
    evidenceReference: string | null;
  }>[];
  requiredCostCents: number;
}>;

export class ReturnServiceError extends Error {
  constructor(
    readonly code:
      | 'INVALID_REQUEST'
      | 'NOT_FOUND'
      | 'LEASE_NOT_RETURNABLE'
      | 'LEASE_ASSET_MISMATCH'
      | 'ASSET_NOT_ALLOCATED'
      | 'ASSET_UNAVAILABLE'
      | 'ALREADY_RETURNED'
      | 'IDEMPOTENCY_CONFLICT'
      | 'INVALID_INSPECTION'
      | 'USAGE_REDUCTION_EVIDENCE_REQUIRED'
      | 'WORK_NOT_FOUND'
      | 'WORK_EVIDENCE_REQUIRED'
      | 'WORK_ALREADY_COMPLETED'
      | 'WORK_OUT_OF_ORDER'
      | 'RETURN_NOT_PENDING'
  ) {
    super(code);
    this.name = 'ReturnServiceError';
  }
}
