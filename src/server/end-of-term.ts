// End of term, on the server: buying the item, passing it on to another customer, and that
// customer's answer. (Returning it is returnContract in contracts.ts.) Each choice writes its
// audit row in the same transaction, and a contract's end of term is decided only once.
import type { Handover as HandoverRow, PrismaClient } from '@/generated/prisma/client';
import { loadCustomers } from '@/data/load';
import { buyoutQuote, endOfTermChoice } from '@/domain/end-of-term';
import { withAudit } from './audit';
import { getContract } from './contracts';
import { contractInvoices } from './invoices';
import { effectiveVatRates } from './vat';

type Refusal = 'not_found' | 'not_ended' | 'already_decided';

export type BuyContractResult =
  | { ok: true; paidCents: number }
  | { ok: false; reason: Refusal | 'unpaid_invoices' | 'no_vat_rate' };

/**
 * The customer buys the item at the end of the lease (a DEMO payment: no money moves). The
 * buyout fixed at signing is charged with VAT at today's rate. The contract becomes `bought`
 * and the item `sold`: it has left the loop.
 */
export async function buyContract(
  db: PrismaClient,
  input: { contractId: string; actor: string },
  todayIso: string
): Promise<BuyContractResult> {
  const contract = await getContract(db, input.contractId);
  if (!contract) return { ok: false, reason: 'not_found' };
  const invoices = (await contractInvoices(db, contract, todayIso)) ?? [];
  const choice = endOfTermChoice(contract, invoices, todayIso);
  if (!choice.canDecide) return { ok: false, reason: choice.reason ?? 'already_decided' };
  if (!choice.canBuy) return { ok: false, reason: 'unpaid_invoices' };
  const quote = buyoutQuote(contract.buyoutCents, await effectiveVatRates(db), todayIso);
  if (!quote) return { ok: false, reason: 'no_vat_rate' };

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'contract.bought',
      entityType: 'contract',
      entityId: contract.id,
      details: { assetId: contract.assetId, ...quote, demo: true },
    },
    async (tx) => {
      await tx.asset.update({
        where: { id: contract.assetId },
        data: { status: 'sold', previous_lives: { increment: 1 } },
      });
      await tx.contract.update({
        where: { id: contract.id },
        data: { status: 'bought', bought_date: todayIso, buyout_paid_cents: quote.totalCents },
      });
    }
  );
  return { ok: true, paidCents: quote.totalCents };
}

export type PassOnResult =
  { ok: true; handoverId: string } | { ok: false; reason: Refusal | 'invalid_recipient' };

/**
 * The customer passes the item on to another customer. The item comes back for a check like a
 * return (one more completed lease), and a pending handover asks the recipient to accept.
 */
export async function passOnContract(
  db: PrismaClient,
  input: { contractId: string; toCustomerId: string; actor: string },
  todayIso: string
): Promise<PassOnResult> {
  const contract = await getContract(db, input.contractId);
  if (!contract) return { ok: false, reason: 'not_found' };
  const customers = await loadCustomers();
  if (
    !customers.some((c) => c.id === input.toCustomerId) ||
    input.toCustomerId === contract.customerId
  ) {
    return { ok: false, reason: 'invalid_recipient' };
  }
  const invoices = (await contractInvoices(db, contract, todayIso)) ?? [];
  const choice = endOfTermChoice(contract, invoices, todayIso);
  if (!choice.canDecide) return { ok: false, reason: choice.reason ?? 'already_decided' };

  const handover = await withAudit(
    db,
    {
      actor: input.actor,
      action: 'contract.passed_on',
      entityType: 'contract',
      entityId: contract.id,
      details: { assetId: contract.assetId, toCustomerId: input.toCustomerId },
    },
    async (tx) => {
      await tx.asset.update({
        where: { id: contract.assetId },
        data: { status: 'returned', previous_lives: { increment: 1 } },
      });
      await tx.contract.update({
        where: { id: contract.id },
        data: { status: 'passed_on', returned_date: todayIso },
      });
      return tx.handover.create({
        data: {
          contract_id: contract.id,
          asset_id: contract.assetId,
          from_name: contract.customerName,
          to_customer_id: input.toCustomerId,
          status: 'pending',
          passed_date: todayIso,
        },
      });
    }
  );
  return { ok: true, handoverId: handover.id };
}

export type Handover = {
  id: string;
  contractId: string;
  assetId: string;
  fromName: string;
  toCustomerId: string;
  status: 'pending' | 'accepted' | 'declined';
  passedDate: string;
  decidedDate: string | null;
};

function toHandover(row: HandoverRow): Handover {
  return {
    id: row.id,
    contractId: row.contract_id,
    assetId: row.asset_id,
    fromName: row.from_name,
    toCustomerId: row.to_customer_id,
    status: row.status as Handover['status'],
    passedDate: row.passed_date,
    decidedDate: row.decided_date,
  };
}

/** Pending handovers addressed to a customer, or all pending ones (`null`, for staff). */
export async function pendingHandovers(
  db: PrismaClient,
  toCustomerId: string | null
): Promise<Handover[]> {
  const rows = await db.handover.findMany({
    where: { status: 'pending', ...(toCustomerId ? { to_customer_id: toCustomerId } : {}) },
    orderBy: { created_at: 'desc' },
  });
  return rows.map(toHandover);
}

export async function handoverForContract(
  db: PrismaClient,
  contractId: string
): Promise<Handover | null> {
  const row = await db.handover.findUnique({ where: { contract_id: contractId } });
  return row ? toHandover(row) : null;
}

export type RespondResult =
  | { ok: true; status: 'accepted' | 'declined' }
  | { ok: false; reason: 'not_found' | 'not_yours' | 'already_decided' };

/**
 * The recipient's answer. Accepting reserves the item for them (the second-life step then
 * leases it to them); declining leaves it returned, in the normal second-life pool.
 */
export async function respondToHandover(
  db: PrismaClient,
  input: { handoverId: string; accept: boolean; customerId: string | null; actor: string },
  todayIso: string
): Promise<RespondResult> {
  const row = await db.handover.findUnique({ where: { id: input.handoverId } });
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.to_customer_id !== input.customerId) return { ok: false, reason: 'not_yours' };
  if (row.status !== 'pending') return { ok: false, reason: 'already_decided' };
  const status = input.accept ? 'accepted' : 'declined';

  await withAudit(
    db,
    {
      actor: input.actor,
      action: `handover.${status}`,
      entityType: 'handover',
      entityId: row.id,
      details: { assetId: row.asset_id, from: row.from_name },
    },
    async (tx) => {
      await tx.handover.update({ where: { id: row.id }, data: { status, decided_date: todayIso } });
      if (input.accept) {
        // Hold it for them; only if it's still waiting for its next life.
        await tx.asset.updateMany({
          where: { id: row.asset_id, status: 'returned' },
          data: { status: 'reserved' },
        });
      }
    }
  );
  return { ok: true, status };
}
