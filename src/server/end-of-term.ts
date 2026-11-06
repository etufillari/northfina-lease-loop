// End of term, on the server: returning the item, buying it, passing it on to another customer,
// and that customer's answer. Every choice needs the lease settled first (no unpaid invoices),
// writes its audit row in the same transaction, and a contract's end is decided only once.
import type { Handover as HandoverRow, PrismaClient } from '@/generated/prisma/client';
import { loadCustomers } from '@/data/load';
import { buyoutQuote, endOfTermChoice } from '@/domain/end-of-term';
import { withAudit } from './audit';
import { getContract, toContract, type Contract } from './contracts';
import { contractInvoices } from './invoices';
import { effectiveVatRates } from './vat';

type Refusal = 'not_found' | 'not_ended' | 'already_decided' | 'unpaid_invoices';

/** Loads a contract and checks that its end of term can be decided now, settled. */
async function decidable(db: PrismaClient, contractId: string, todayIso: string) {
  const contract = await getContract(db, contractId);
  if (!contract) return { ok: false as const, reason: 'not_found' as const };
  const invoices = (await contractInvoices(db, contract, todayIso)) ?? [];
  const choice = endOfTermChoice(contract, invoices, todayIso);
  if (!choice.canDecide) {
    return { ok: false as const, reason: choice.reason ?? ('already_decided' as const) };
  }
  if (!choice.settled) return { ok: false as const, reason: 'unpaid_invoices' as const };
  return { ok: true as const, contract };
}

export type ReturnContractResult =
  { ok: true; contract: Contract } | { ok: false; reason: Refusal };

/**
 * The customer returns the item after the lease's last day. The contract becomes `returned` and
 * the item `returned` (waiting for a check and a second life) with one more completed lease.
 */
export async function returnContract(
  db: PrismaClient,
  input: { contractId: string; actor: string },
  todayIso: string
): Promise<ReturnContractResult> {
  const check = await decidable(db, input.contractId, todayIso);
  if (!check.ok) return check;
  const { contract } = check;
  const row = await withAudit(
    db,
    {
      actor: input.actor,
      action: 'contract.returned',
      entityType: 'contract',
      entityId: contract.id,
      details: { assetId: contract.assetId, endDate: contract.endDate, returnedDate: todayIso },
    },
    async (tx) => {
      await tx.asset.update({
        where: { id: contract.assetId },
        data: { status: 'returned', previous_lives: { increment: 1 } },
      });
      return tx.contract.update({
        where: { id: contract.id },
        data: { status: 'returned', returned_date: todayIso },
      });
    }
  );
  return { ok: true, contract: toContract(row) };
}

export type BuyContractResult =
  { ok: true; paidCents: number } | { ok: false; reason: Refusal | 'no_vat_rate' };

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
  const check = await decidable(db, input.contractId, todayIso);
  if (!check.ok) return check;
  const { contract } = check;
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
  const check = await decidable(db, input.contractId, todayIso);
  if (!check.ok) return check;
  const { contract } = check;
  const customers = await loadCustomers();
  if (
    !customers.some((c) => c.id === input.toCustomerId) ||
    input.toCustomerId === contract.customerId
  ) {
    return { ok: false, reason: 'invalid_recipient' };
  }

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

/**
 * Pending handovers addressed to a customer, or all pending ones (`null`, for staff), that
 * exist on `todayIso`: a pass-on made on a later date (while time-travelling ahead) hasn't
 * happened yet.
 */
export async function pendingHandovers(
  db: PrismaClient,
  toCustomerId: string | null,
  todayIso: string
): Promise<Handover[]> {
  const rows = await db.handover.findMany({
    where: {
      status: 'pending',
      passed_date: { lte: todayIso },
      ...(toCustomerId ? { to_customer_id: toCustomerId } : {}),
    },
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
  | { ok: false; reason: 'not_found' | 'not_yours' | 'already_decided' | 'not_yet' };

/**
 * The recipient's answer, from the day of the pass-on. Accepting marks the item as held for them
 * (`reserved_for`): it still gets its check first, and once refurbished it is reserved for them
 * and only they can lease it. Declining leaves it in the normal second-life pool.
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
  if (todayIso < row.passed_date) return { ok: false, reason: 'not_yet' };
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
        // Hold it for them while it waits for its check (only if it is still waiting).
        await tx.asset.updateMany({
          where: { id: row.asset_id, status: 'returned' },
          data: { reserved_for: row.to_customer_id },
        });
      }
    }
  );
  return { ok: true, status };
}
