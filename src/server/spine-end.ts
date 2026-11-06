import { loadCustomers, loadVatRates } from '@/data/load';
import { mayEndLease } from '@/domain/lifecycle';
import { taxOn } from '@/domain/vat';
import { ApiError } from './api-response';
import { withAudit } from './audit';
import { requireCustomer, type DemoContext } from './demo-context';
import type { PrismaClient } from './prisma-client';
import { rethrowDatabaseConflict, requestHash, requireSameRequest } from './request-integrity';
import type { EndInput } from './spine-shapes';
import { contractTerms, getContract, ownedContract } from './spine-views';
import { requireStorableInvoice } from './spine-invoice-limits';

export async function endLease(
  db: PrismaClient,
  context: DemoContext,
  contractId: string,
  input: EndInput
) {
  requireCustomer(context);
  const contract = await ownedContract(db, context, contractId);
  const fingerprint = requestHash({ customerId: context.customer.id, contractId, input });
  if (contract.close_request_id === input.requestId) {
    requireSameRequest(contract.close_request_hash, fingerprint);
    return getContract(db, context, contractId);
  }
  const terms = contractTerms(contract);
  const [asset, rentals, latestInvoice, customers, vatRates] = await Promise.all([
    db.asset.findUniqueOrThrow({ where: { id: contract.asset_id } }),
    db.invoice.count({ where: { contract_id: contractId, kind: 'rent' } }),
    db.invoice.findFirst({ where: { contract_id: contractId }, orderBy: { invoice_date: 'desc' } }),
    loadCustomers(),
    loadVatRates(),
  ]);
  if (
    input.choice === 'pass_on' &&
    !customers.some((customer) => customer.id === input.nextCustomerId)
  ) {
    throw new ApiError(422, 'SUCCESSOR_UNKNOWN', 'Select a known next customer');
  }
  const transition = mayEndLease({
    status: contract.status,
    endDate: contract.end_date,
    onDate: context.businessDate,
    termMonths: terms.termMonths,
    rentalInvoiceCount: rentals,
    choice: input.choice,
    customerId: context.customer.id,
    nextCustomerId: input.nextCustomerId,
    previousUsageValue: asset.usage_value,
    usageValue: input.usageValue,
    latestInvoiceDate: latestInvoice?.invoice_date,
  });
  if (!transition.ok)
    throw new ApiError(
      409,
      'END_NOT_ALLOWED',
      'This lease cannot end with the selected action yet',
      { reason: transition.reason }
    );
  const buyout = taxOn(terms.buyoutNetCents, context.businessDate, vatRates);
  if (input.choice === 'buy' && !buyout.ok)
    throw new ApiError(422, 'VAT_UNAVAILABLE', 'A VAT rate is missing for the buyout date');
  if (input.choice === 'buy' && buyout.ok) requireStorableInvoice(buyout.amount);
  const status = { buy: 'bought', return: 'returned', pass_on: 'passed_on' }[input.choice];

  try {
    await withAudit(
      db,
      {
        actor: context.actor,
        action: `contract.${status}`,
        entityType: 'contract',
        entityId: contractId,
        details: {
          assetId: asset.id,
          lifeNumber: contract.life_number,
          businessDate: context.businessDate,
        },
      },
      async (tx) => {
        const changed = await tx.contract.updateMany({
          where: { id: contractId, status: 'active' },
          data: {
            status,
            closed_on: context.businessDate,
            close_request_id: input.requestId,
            close_request_hash: fingerprint,
            next_customer_id: input.choice === 'pass_on' ? input.nextCustomerId : null,
          },
        });
        if (changed.count !== 1)
          throw new ApiError(409, 'END_NOT_ALLOWED', 'This lease has already ended');
        await tx.assetLease.delete({ where: { asset_id: asset.id } });
        await tx.asset.update({
          where: { id: asset.id },
          data: {
            status: input.choice === 'buy' ? 'reserved' : 'returned',
            previous_lives: { increment: 1 },
            ...(input.choice === 'buy'
              ? {}
              : { condition: input.condition, usage_value: input.usageValue }),
          },
        });
        if (input.choice === 'buy' && buyout.ok) {
          await tx.invoice.create({
            data: {
              id: `${contractId}:buyout:0`,
              contract_id: contractId,
              kind: 'buyout',
              period: 0,
              scheduled_for: context.businessDate,
              invoice_date: context.businessDate,
              due_date: context.businessDate,
              net_cents: buyout.amount.netCents,
              vat_basis_points: buyout.amount.vatBasisPoints,
              vat_cents: buyout.amount.vatCents,
              gross_cents: buyout.amount.grossCents,
            },
          });
        } else {
          const reset = {
            net_price_cents: null,
            ready_on: null,
            valuation_reason: null,
            relist_request_id: null,
            relist_request_hash: null,
            reserved_for_customer_id: input.choice === 'pass_on' ? input.nextCustomerId : null,
          };
          await tx.assetRelease.upsert({
            where: { asset_id: asset.id },
            create: { asset_id: asset.id, revision: 1, ...reset },
            update: { revision: { increment: 1 }, ...reset },
          });
        }
      }
    );
  } catch (error) {
    const committed = await db.contract.findUnique({ where: { id: contractId } });
    if (committed?.close_request_id === input.requestId) {
      requireSameRequest(committed.close_request_hash, fingerprint);
      return getContract(db, context, contractId);
    }
    rethrowDatabaseConflict(error);
  }
  return getContract(db, context, contractId);
}
