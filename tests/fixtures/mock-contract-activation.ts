import { vi } from 'vitest';
import type { LeaseTerms } from '@/domain/lease-engine/types';
import type { ContractActivationPort } from '@/server/lease-engine/contract-activation';
import { EngineServiceError } from '@/server/lease-engine/contracts';

export const ainoSignedTerms: LeaseTerms = Object.freeze({
  contractId: 'contract-aino-1',
  assetId: 'ebike-003',
  customerId: 'cust-aino',
  startDate: '2026-11-05',
  termMonths: 36,
  monthlyNetCents: 10730,
  paymentDueDays: 14,
});

/** Test-only signed/approved decision. Does not prove real signing or allocation correctness.
 * The existing asset row is a real DB write solely to exercise shared rollback semantics.
 */
export function mockContractActivation(
  options: { approved?: boolean; failAfterLease?: boolean } = {}
) {
  const prepareActivation = vi.fn<ContractActivationPort['prepareActivation']>(
    async (tx, contractId) => {
      if (contractId !== ainoSignedTerms.contractId) throw new EngineServiceError('NOT_FOUND');
      if (options.approved === false)
        throw new EngineServiceError('INVALID_TRANSITION', 'mock_contract_not_approved');
      const reserved = await tx.asset.updateMany({
        where: { id: ainoSignedTerms.assetId, status: 'available' },
        data: { status: 'reserved' },
      });
      if (reserved.count !== 1)
        throw new EngineServiceError('INVALID_TRANSITION', 'mock_asset_unavailable');
      return { ...ainoSignedTerms };
    }
  );
  const recordActivation = vi.fn<ContractActivationPort['recordActivation']>(async () => {
    if (options.failAfterLease) throw new Error('mock contract update failed');
    // Intentionally no fake contract persistence: Dev2 will supply the actual implementation.
  });
  return { prepareActivation, recordActivation } satisfies ContractActivationPort;
}
