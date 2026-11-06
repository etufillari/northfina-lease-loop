// Ending a contract: the customer's choice, and closing the ones nobody decided in time.
// Either way one transaction closes the contract, the asset and the asset life together.
import type { Contract } from '@/data/lease-schemas';
import { loadCustomers, loadSecondLifeDemand, loadVatRates } from '@/data/load';
import { assetCategorySchema, type Customer } from '@/data/schemas';
import {
  assetStatusAfter,
  buyoutInvoice,
  choiceDeadline,
  endChoice,
  endProblem,
  passOnCandidates,
  type EndOutcome,
} from '@/domain/end-of-term/end-of-term';
import { customerAddress } from '@/domain/notifications';
import type { PrismaClient } from '@/generated/prisma/client';
import { assetName } from '../assets/assets';
import { SYSTEM_ACTOR, withAudit } from '../audit';
import { contractViews, getContract, toContract, type ContractView } from '../contract/contracts';
import { currentDate } from '../date/app-date';

class AlreadyEnded extends Error {}

async function closeContract(
  db: PrismaClient,
  input: {
    contract: Contract;
    outcome: EndOutcome;
    endDate: string;
    actor: string;
    passedTo?: string;
  }
): Promise<void> {
  const { contract, outcome, endDate, actor, passedTo = null } = input;
  const assetStatus = assetStatusAfter(outcome);
  const invoice =
    outcome === 'bought_out' ? buyoutInvoice(contract, await loadVatRates(), endDate) : null;

  const item = await assetName(db, contract.asset_id);

  await withAudit(
    db,
    {
      actor,
      action: 'contract.ended',
      entityType: 'contract',
      entityId: contract.id,
      details: {
        outcome,
        end_date: endDate,
        automatic: actor === SYSTEM_ACTOR,
        asset_id: contract.asset_id,
        asset_status: { from: 'leased', to: assetStatus },
        passed_to: passedTo,
        buyout_invoice_cents: invoice?.total_cents ?? null,
      },
      notify: [
        ...(passedTo === null
          ? []
          : [{ to: customerAddress(passedTo), kind: 'passed_to_you' as const, item }]),
        ...(actor === SYSTEM_ACTOR
          ? [{ to: customerAddress(contract.customer_id), kind: 'lease_closed' as const, item }]
          : []),
      ],
    },
    async (tx) => {
      // The condition is in the update itself, so a contract can only be closed once.
      const closed = await tx.contract.updateMany({
        where: { id: contract.id, status: 'active' },
        data: { status: outcome, actual_end_on: endDate, passed_to: passedTo },
      });
      if (closed.count === 0) throw new AlreadyEnded();

      await tx.asset.update({
        where: { id: contract.asset_id },
        data: { status: assetStatus, reserved_for: passedTo },
      });
      await tx.assetLife.updateMany({
        where: { contract_id: contract.id },
        data: { ended_on: endDate, outcome },
      });
      if (invoice) await tx.invoice.create({ data: invoice });
    }
  );
}

export type EndResult =
  | { ok: true; contract: ContractView }
  | {
      ok: false;
      reason:
        | 'contract_not_found'
        | 'already_ended'
        | 'not_due'
        | 'window_closed'
        | 'invalid_pass_on_target';
    };

/** The customers this contract's item can be passed on to. */
export async function contractPassOnCandidates(
  db: PrismaClient,
  contract: Contract
): Promise<Customer[]> {
  const [customers, demand, asset] = await Promise.all([
    loadCustomers(),
    loadSecondLifeDemand(),
    db.asset.findUniqueOrThrow({ where: { id: contract.asset_id }, select: { category: true } }),
  ]);
  const category = assetCategorySchema.parse(asset.category);
  return passOnCandidates(customers, demand, category, contract.customer_id);
}

export type PassOnCandidatesResult =
  | { ok: true; candidates: { id: string; name: string }[] }
  | { ok: false; reason: 'contract_not_found' | 'already_ended' };

/** Who the owner can choose, showing only what they need to pick someone. */
export async function listPassOnCandidates(
  db: PrismaClient,
  input: { contractId: string; customer: Customer }
): Promise<PassOnCandidatesResult> {
  const contract = await getContract(db, input.contractId);
  if (!contract || contract.customer_id !== input.customer.id) {
    return { ok: false, reason: 'contract_not_found' };
  }
  if (contract.status !== 'active') return { ok: false, reason: 'already_ended' };

  const candidates = await contractPassOnCandidates(db, contract);
  return {
    ok: true,
    candidates: candidates.map(({ id, name }) => ({ id, name })),
  };
}

/** The customer's own choice at the end of the lease. */
export async function endContract(
  db: PrismaClient,
  input: { contractId: string; customer: Customer; outcome: EndOutcome; passedTo?: string }
): Promise<EndResult> {
  const { contractId, customer, outcome, passedTo } = input;
  const contract = await getContract(db, contractId);
  if (!contract) return { ok: false, reason: 'contract_not_found' };

  const today = await currentDate(db);
  const problem = endProblem(contract, customer.id, today);
  if (problem === 'not_owner') return { ok: false, reason: 'contract_not_found' };
  if (problem !== null) return { ok: false, reason: problem };

  if (passedTo !== undefined && outcome !== 'passed_on') {
    return { ok: false, reason: 'invalid_pass_on_target' };
  }
  if (outcome === 'passed_on') {
    const candidates = await contractPassOnCandidates(db, contract);
    if (!candidates.some((candidate) => candidate.id === passedTo)) {
      return { ok: false, reason: 'invalid_pass_on_target' };
    }
  }

  try {
    await closeContract(db, { contract, outcome, endDate: today, actor: customer.id, passedTo });
  } catch (error) {
    if (error instanceof AlreadyEnded) return { ok: false, reason: 'already_ended' };
    throw error;
  }

  const closed = await getContract(db, contractId);
  if (!closed) throw new Error(`contract ${contractId} disappeared while closing`);
  const [view] = await contractViews(db, [closed]);
  if (!view) throw new Error('a contract view is always returned for a contract');
  return { ok: true, contract: view };
}

/**
 * Closes every active contract whose choice window has passed, as returned. It ends on the
 * last day of the window, not the day this ran, so the record does not depend on when the
 * scheduler happened to fire. Safe to run at any time: closed contracts are skipped.
 */
export async function closeExpiredContracts(
  db: PrismaClient,
  today: string
): Promise<{ closed: string[] }> {
  const rows = await db.contract.findMany({ where: { status: 'active' } });
  const expired = rows.map(toContract).filter((c) => endChoice(c, today) === 'expired');

  const closed: string[] = [];
  for (const contract of expired) {
    try {
      await closeContract(db, {
        contract,
        outcome: 'returned',
        endDate: choiceDeadline(contract),
        actor: SYSTEM_ACTOR,
      });
      closed.push(contract.id);
    } catch (error) {
      if (!(error instanceof AlreadyEnded)) throw error;
    }
  }
  return { closed };
}

/** `closeExpiredContracts` on the date the app runs on. */
export async function closeDueContracts(db: PrismaClient): Promise<{ closed: string[] }> {
  return closeExpiredContracts(db, await currentDate(db));
}
