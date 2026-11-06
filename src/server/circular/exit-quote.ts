import type { PrismaClient } from '@/generated/prisma/client';
import { loadVatRates } from '@/data/load';
import { calculateExitQuote } from '@/domain/circular/exit-quote';
import { toLeaseDTO, EngineServiceError } from '@/server/lease-engine/contracts';

export async function previewEarlyExit(db: PrismaClient, leaseId: string, elapsedMonths: number) {
  const lease = await db.engineLease.findUnique({ where: { id: leaseId } });
  if (!lease) throw new EngineServiceError('NOT_FOUND');
  const contract = await db.contract.findUnique({ where: { id: lease.contractId } });
  if (lease.status !== 'ACTIVE' || contract?.termination_policy !== 'EXIT_CAP_BUYOUT_V1')
    throw new EngineServiceError('INVALID_TRANSITION', 'early_policy_or_boundary_invalid');
  if (elapsedMonths >= lease.termMonths)
    throw new EngineServiceError('INVALID_TRANSITION', 'early_policy_or_boundary_invalid');
  const quote = calculateExitQuote(
    toLeaseDTO(lease),
    contract.buyout_net_cents,
    elapsedMonths,
    (await loadVatRates()).rates
  );
  const futureInvoice = await db.engineInvoice.findFirst({
    where: { leaseId, issueDate: { gte: quote.effectiveOn } },
  });
  return { ...quote, blockedByIssuedInvoices: !!futureInvoice };
}
