import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import type { LeaseTerms } from '@/domain/lease-engine/types';
import type { TransactionClient } from '@/server/audit';
import { auditedCommand } from './commands';
import { activateLeaseInTransaction } from './leases';
import { EngineServiceError, termsSchema, type CommandContext, type LeaseDTO } from './contracts';

/** Proposed Dev2 adapter: owns signing/eligibility checks, allocation and contract state.
 * Every write must use the supplied tx. No network calls inside this transaction.
 */
export interface ContractActivationPort {
  prepareActivation(tx: TransactionClient, contractId: string): Promise<LeaseTerms>;
  recordActivation(tx: TransactionClient, contractId: string, leaseId: string): Promise<void>;
}

/** Internal composition seam, not an HTTP entrypoint or proof of real contract integration.
 * Dev2 can supply its adapter or use activateLeaseInTransaction in its own orchestrator.
 */
export async function activateFromSignedContract(
  db: PrismaClient,
  context: CommandContext,
  input: { contractId: string; activatedOn: string },
  contracts: ContractActivationPort
): Promise<LeaseDTO> {
  const payload = z
    .strictObject({ contractId: z.string().trim().min(1).max(100), activatedOn: z.iso.date() })
    .parse(input);
  return auditedCommand(
    db,
    context,
    'activate_contract',
    payload.contractId,
    payload,
    async (tx) => {
      const terms = termsSchema.parse(await contracts.prepareActivation(tx, payload.contractId));
      if (terms.contractId !== payload.contractId) {
        throw new EngineServiceError('INVALID_TRANSITION', 'contract_reference_mismatch');
      }
      const lease = await activateLeaseInTransaction(tx, terms, payload.activatedOn);
      await contracts.recordActivation(tx, payload.contractId, lease.leaseId);
      return lease;
    }
  );
}
