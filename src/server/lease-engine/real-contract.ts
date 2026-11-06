import type { Contract, PrismaClient } from '@/generated/prisma/client';
import type { TransactionClient } from '@/server/audit';
import { signContract, type SignContractInput } from '@/server/applications';
import { toLeaseTerms } from '@/domain/contract';
import { activateLeaseInTransaction } from './leases';
import { auditedCommand } from './commands';
import { EngineServiceError, toLeaseDTO, type CommandContext } from './contracts';

function terms(contract: Contract) {
  return toLeaseTerms({
    id: contract.id,
    customerId: contract.customer_id,
    assetId: contract.asset_id,
    startDate: contract.start_date,
    termMonths: contract.term_months,
    monthlyNetCents: contract.monthly_net_cents,
    paymentDueDays: contract.payment_due_days,
  });
}

/** Signing already acquired the asset for this contract. Pin that reservation permanently. */
async function activateSignedInTransaction(tx: TransactionClient, contract: Contract) {
  const existing = await tx.engineLease.findUnique({ where: { contractId: contract.id } });
  if (existing) return toLeaseDTO(existing);
  const application = await tx.application.findUnique({ where: { id: contract.application_id } });
  if (
    !application ||
    application.status !== 'APPROVED' ||
    !application.signing_authority ||
    contract.signer_id !== contract.customer_id
  )
    throw new EngineServiceError('INVALID_TRANSITION');
  const owned = await tx.asset.updateMany({
    where: { id: contract.asset_id, status: 'reserved', reserved_by: contract.id },
    data: { reserved_until: null },
  });
  if (owned.count !== 1)
    throw new EngineServiceError('INVALID_TRANSITION', 'asset_not_allocated_to_contract');
  const lease = await activateLeaseInTransaction(tx, terms(contract), contract.start_date);
  await tx.engineAllocation.create({
    data: { assetId: contract.asset_id, leaseId: lease.leaseId },
  });
  return lease;
}

/** Contract, application signing, asset reservation, lease and allocation share ONE audited tx. */
export function signAndActivateContract(db: PrismaClient, input: SignContractInput) {
  return signContract(db, input, async (tx, contract) => {
    await activateSignedInTransaction(tx, contract);
  });
}

/** Activates contracts signed before engine integration; safe request replay and no reactivation. */
export function activateExistingContract(
  db: PrismaClient,
  context: CommandContext,
  contractId: string
) {
  return auditedCommand(
    db,
    context,
    'activate_contract',
    contractId,
    { contractId },
    async (tx) => {
      const contract = await tx.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw new EngineServiceError('NOT_FOUND');
      return activateSignedInTransaction(tx, contract);
    }
  );
}
