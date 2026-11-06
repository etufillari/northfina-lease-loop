// Signing and reading contracts. Signing is one transaction: the asset becomes leased, the
// contract is created and a new life opens, or none of it happens.
import { randomUUID } from 'node:crypto';
import { contractSchema, type Contract } from '@/data/lease-schemas';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { buildContract, lockedQuote, openLife, signingProblem } from '@/domain/contract/contract';
import { listPriceOn } from '@/domain/pricing/price-list';
import type { Contract as ContractRow, PrismaClient } from '@/generated/prisma/client';
import { getApplication } from '../application/applications';
import { toAsset } from '../assets/assets';
import { withAudit } from '../audit';
import { currentDate } from '../date/app-date';

export function toContract(row: ContractRow): Contract {
  return contractSchema.parse({
    id: row.id,
    application_id: row.application_id,
    customer_id: row.customer_id,
    asset_id: row.asset_id,
    quantity: row.quantity,
    quote_date: row.quote_date,
    signed_on: row.signed_on,
    start_on: row.start_on,
    planned_end_on: row.planned_end_on,
    actual_end_on: row.actual_end_on,
    status: row.status,
    price_list_version: row.price_list_version,
    base_price_cents: row.base_price_cents,
    down_payment_cents: row.down_payment_cents,
    financed_cents: row.financed_cents,
    term_months: row.term_months,
    band: row.band,
    factor_micros: row.factor_micros,
    annual_interest_basis_points: row.annual_interest_basis_points,
    monthly_net_rent_cents: row.monthly_net_rent_cents,
    buyout_cents: row.buyout_cents,
  });
}

/**
 * A contract as the screens see it. The list price on the signing date is what lets the UI
 * explain the lock: "you keep the price from your quote; the list says X today". It is
 * looked up when read and is `null` for a re-listed item, which has no list price.
 */
export type ContractView = Contract & { list_price_on_signing_cents: number | null };

export async function contractViews(contracts: readonly Contract[]): Promise<ContractView[]> {
  const priceLists = await loadPriceLists();
  return contracts.map((contract) => {
    const listPrice = listPriceOn(priceLists, contract.asset_id, contract.signed_on);
    const isListed = contract.price_list_version !== null && listPrice.ok;
    return {
      ...contract,
      list_price_on_signing_cents: isListed ? listPrice.priceCents * contract.quantity : null,
    };
  });
}

export async function getContract(db: PrismaClient, id: string): Promise<Contract | null> {
  const row = await db.contract.findUnique({ where: { id } });
  return row ? toContract(row) : null;
}

export async function listContracts(
  db: PrismaClient,
  filter: { customerId?: string } = {}
): Promise<Contract[]> {
  const rows = await db.contract.findMany({
    where: { customer_id: filter.customerId },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toContract);
}

export type SignResult =
  | { ok: true; contract: ContractView }
  | { ok: false; reason: 'application_not_found' | 'not_approved' | 'already_signed' }
  | { ok: false; reason: 'asset_not_available' }
  | { ok: false; reason: 'signatory_required'; signatory_email: string | null };

class AssetNotAvailable extends Error {}

/**
 * Signs an approved application. The quote always wins: the price comes from the application,
 * and the signing date only sets the contract's dates. The asset moves from available to
 * leased inside the transaction, so two signings cannot lease the same item.
 */
export async function signContract(
  db: PrismaClient,
  input: { applicationId: string; customer: Customer }
): Promise<SignResult> {
  const { applicationId, customer } = input;

  const application = await getApplication(db, applicationId);
  if (!application) return { ok: false, reason: 'application_not_found' };

  const problem = signingProblem(application, customer);
  if (problem === 'not_owner') return { ok: false, reason: 'application_not_found' };
  if (problem === 'not_approved') return { ok: false, reason: 'not_approved' };
  if (problem === 'signatory_required') {
    const email = application.answers.q_signatory_email;
    return {
      ok: false,
      reason: 'signatory_required',
      signatory_email: typeof email === 'string' ? email : null,
    };
  }

  const existing = await db.contract.findUnique({
    where: { application_id: applicationId },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: 'already_signed' };

  const locked = lockedQuote(await loadCoefficientTable(), application);
  if (!locked.ok) {
    throw new Error(`approved application ${applicationId} cannot be priced: ${locked.reason}`);
  }

  const id = `con-${randomUUID()}`;
  const contract: Contract = {
    id,
    ...buildContract(application, locked.quote, await currentDate(db)),
  };

  try {
    await withAudit(
      db,
      {
        actor: customer.id,
        action: 'contract.signed',
        entityType: 'contract',
        entityId: id,
        details: {
          application_id: applicationId,
          asset_id: contract.asset_id,
          price_list_version: contract.price_list_version,
          monthly_net_rent_cents: contract.monthly_net_rent_cents,
          signed_on: contract.signed_on,
          start_on: contract.start_on,
        },
      },
      async (tx) => {
        const taken = await tx.asset.updateMany({
          where: { id: contract.asset_id, status: 'available' },
          data: { status: 'leased' },
        });
        if (taken.count === 0) throw new AssetNotAvailable();

        await tx.contract.create({ data: contract });

        const assetRow = await tx.asset.findUniqueOrThrow({ where: { id: contract.asset_id } });
        const latestLife = await tx.assetLife.findFirst({
          where: { asset_id: contract.asset_id },
          orderBy: { life_number: 'desc' },
          select: { life_number: true, first_lease_price_cents: true },
        });
        await tx.assetLife.create({ data: openLife(contract, toAsset(assetRow), latestLife) });
      }
    );
  } catch (error) {
    if (error instanceof AssetNotAvailable) return { ok: false, reason: 'asset_not_available' };
    throw error;
  }

  const [view] = await contractViews([contract]);
  if (!view) throw new Error('a contract view is always returned for a contract');
  return { ok: true, contract: view };
}
