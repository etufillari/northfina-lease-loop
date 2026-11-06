import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import { loadVatRates } from '@/data/load';
import { anniversary } from '@/domain/lease-engine/calendar';
import { resolveVat } from '@/domain/lease-engine/invoice';
import { earlyReturnNet } from '@/domain/circular/exit';
import { roundRatio } from '@/domain/circular/money';
import { auditedCommand } from '@/server/lease-engine/commands';
import { EngineServiceError, type CommandContext } from '@/server/lease-engine/contracts';
function invalid(reason: string): never {
  throw new EngineServiceError('INVALID_TRANSITION', reason);
}

/** Records a settlement obligation, never pretends that payment was received. */
export async function selectEndOption(
  db: PrismaClient,
  context: CommandContext,
  input: { leaseId: string; option: string; elapsedMonths?: number }
) {
  const payload = z
    .strictObject({
      leaseId: z.string().min(1),
      option: z.enum(['RETURN', 'PASS_ON', 'BUYOUT', 'EARLY_RETURN']),
      elapsedMonths: z.number().int().min(1).max(47).optional(),
    })
    .parse(input);
  const rates = (await loadVatRates()).rates;
  return auditedCommand(db, context, 'end_option', payload.leaseId, payload, async (tx) => {
    const lease = await tx.engineLease.findUnique({ where: { id: payload.leaseId } });
    if (!lease) throw new EngineServiceError('NOT_FOUND');
    const allocation = await tx.engineAllocation.findUnique({ where: { assetId: lease.assetId } });
    if (allocation?.leaseId !== lease.id) invalid('allocation_missing_or_wrong_life');
    if (await tx.leaseSettlement.findUnique({ where: { leaseId: lease.id } }))
      invalid('end_option_already_selected');
    const contract = await tx.contract.findUnique({ where: { id: lease.contractId } });
    if (!contract) throw new EngineServiceError('NOT_FOUND');
    let effective = anniversary(lease.startDate, lease.termMonths);
    let netCents = 0;
    if (payload.option === 'EARLY_RETURN') {
      if (
        lease.status !== 'ACTIVE' ||
        !payload.elapsedMonths ||
        payload.elapsedMonths >= lease.termMonths ||
        contract.termination_policy !== 'EXIT_CAP_BUYOUT_V1'
      )
        invalid('early_policy_or_boundary_invalid');
      effective = anniversary(lease.startDate, payload.elapsedMonths ?? 0);
      netCents = earlyReturnNet(
        lease.monthlyNetCents,
        lease.termMonths,
        payload.elapsedMonths ?? 0,
        contract.buyout_net_cents
      ).feeNetCents;
      if (!effective.ok) invalid('invalid_exit_date');
      if (
        await tx.engineInvoice.findFirst({
          where: { leaseId: lease.id, issueDate: { gte: effective.value } },
        })
      )
        invalid('issued_future_invoice_requires_credit');
      await tx.engineLease.update({
        where: { id: lease.id },
        data: { status: 'TERMINATED', terminatedOn: effective.value, version: { increment: 1 } },
      });
    } else {
      if (lease.status !== 'COMPLETED') invalid('complete_lease_first');
      if (payload.option === 'BUYOUT') {
        if (contract.financed_cents <= 0 || contract.buyout_net_cents <= 0)
          invalid('legacy_contract_missing_buyout_snapshot');
        netCents = contract.buyout_net_cents;
        await tx.engineAllocation.delete({ where: { assetId: lease.assetId } });
        await tx.asset.update({
          where: { id: lease.assetId },
          data: {
            status: 'retired',
            reserved_until: null,
            reserved_by: null,
            previous_lives: { increment: 1 },
          },
        });
      }
    }
    if (!effective.ok) invalid('invalid_date');
    const tax = resolveVat(rates, effective.value);
    if (!tax.ok) throw new EngineServiceError('INVALID_CALCULATION', tax.reason);
    const vatCents = roundRatio(BigInt(netCents) * BigInt(tax.value.rateBps), 10000n);
    return tx.leaseSettlement.create({
      data: {
        leaseId: lease.id,
        option: payload.option,
        netCents,
        vatCents,
        grossCents: netCents + vatCents,
        effectiveOn: effective.value,
      },
    });
  });
}
