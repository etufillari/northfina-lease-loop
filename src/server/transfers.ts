// "Pass it on", route (a): mid-lease transfer (docs/DECISIONS.md). The lessee shares a
// link; the recipient applies through the NORMAL question flow against the remaining
// schedule — no down payment, the locked rent carries over unchanged — and on approval +
// signature the contract moves to them. Route (b), the end-of-term nomination, lives in
// lifecycle.ts.
import { loadCoefficientTable } from '@/data/load';
import { monthlyFactorFor } from '@/domain/coefficient';
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit } from '@/server/audit';

type Db = PrismaClient;

export type TransferLinkResult =
  { ok: true; token: string } | { ok: false; reason: 'not_found' | 'not_active' };

/** The lessee creates (or re-uses) the shareable link for their contract. */
export async function createTransferLink(
  db: Db,
  input: { contractId: string; actor: string }
): Promise<TransferLinkResult> {
  const contract = await db.contract.findUnique({ where: { id: input.contractId } });
  if (!contract) return { ok: false, reason: 'not_found' };
  if (contract.status !== 'active') return { ok: false, reason: 'not_active' };
  if (contract.transfer_token) return { ok: true, token: contract.transfer_token };

  const token = crypto.randomUUID();
  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'contract.transfer_link_created',
      entityType: 'contract',
      entityId: input.contractId,
    },
    (tx) => tx.contract.update({ where: { id: input.contractId }, data: { transfer_token: token } })
  );
  return { ok: true, token };
}

/** What the recipient sees before applying: the lease they would take over. */
export async function getTransferOffer(db: Db, token: string) {
  const contract = await db.contract.findFirst({
    where: { transfer_token: token, status: 'active' },
    include: { assets: true, invoices: { orderBy: { number: 'asc' } } },
  });
  if (!contract) return null;
  const assets = await db.asset.findMany({
    where: { id: { in: contract.assets.map((a) => a.asset_id) } },
  });
  return { contract, assets };
}

export type TransferApplyResult =
  { ok: true; applicationId: string } | { ok: false; reason: 'not_found' | 'own_contract' };

/**
 * The recipient starts the take-over application. The cloned quote carries the contract's
 * LOCKED numbers (no down payment, same rent), so eligibility — the 30 % affordability rule
 * included — is judged against what they would actually pay.
 */
export async function startTransferApplication(
  db: Db,
  input: { token: string; customerId: string; actor: string; asOf: string }
): Promise<TransferApplyResult> {
  const offer = await getTransferOffer(db, input.token);
  if (!offer) return { ok: false, reason: 'not_found' };
  const { contract } = offer;
  if (contract.customer_id === input.customerId) return { ok: false, reason: 'own_contract' };

  const table = await loadCoefficientTable();
  const factor = monthlyFactorFor(table, contract.financed_cents, contract.term_months);
  const applicationId = crypto.randomUUID();
  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'application.transfer_started',
      entityType: 'application',
      entityId: applicationId,
      details: { contractId: contract.id },
    },
    async (tx) => {
      const quote = await tx.quote.create({
        data: {
          id: crypto.randomUUID(),
          asset_id: contract.assets[0]!.asset_id,
          asset_ids_json: JSON.stringify(contract.assets.map((a) => a.asset_id)),
          customer_id: input.customerId,
          quantity: contract.assets.length,
          quote_date: input.asOf,
          price_list_version: contract.price_list_version,
          unit_list_price_cents: contract.financed_cents,
          list_price_cents: contract.financed_cents,
          down_payment_cents: 0,
          term_months: contract.term_months,
          financed_cents: contract.financed_cents,
          band: factor.ok ? factor.band.band : '-',
          factor_ppm: factor.ok ? Math.round(factor.factor * 1_000_000) : 0,
          monthly_net_rent_cents: contract.monthly_net_rent_cents,
          net_total_cents: contract.net_total_cents,
          last_month_net_rent_cents: contract.last_month_net_rent_cents,
          buyout_net_cents: contract.buyout_net_cents,
        },
      });
      await tx.application.create({
        data: {
          id: applicationId,
          quote_id: quote.id,
          customer_id: input.customerId,
          transfer_contract_id: contract.id,
        },
      });
    }
  );
  return { ok: true, applicationId };
}

export type ExecuteTransferResult =
  { ok: true; contractId: string } | { ok: false; reason: 'not_found' | 'not_active' };

/**
 * Approval + signature move the contract: same locked rent, same remaining schedule, new
 * customer. The old lessee's obligations end here, and the passport says so.
 */
export async function executeTransfer(
  db: Db,
  input: {
    applicationId: string;
    contractId: string;
    newCustomerId: string;
    actor: string;
    asOf: string;
  }
): Promise<ExecuteTransferResult> {
  const contract = await db.contract.findUnique({
    where: { id: input.contractId },
    include: { assets: true },
  });
  if (!contract) return { ok: false, reason: 'not_found' };
  if (contract.status !== 'active') return { ok: false, reason: 'not_active' };

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'contract.transferred',
      entityType: 'contract',
      entityId: contract.id,
      details: { from: contract.customer_id, to: input.newCustomerId },
    },
    async (tx) => {
      await tx.contract.update({
        where: { id: contract.id },
        data: { customer_id: input.newCustomerId, transfer_token: null },
      });
      await tx.application.update({
        where: { id: input.applicationId },
        data: { status: 'signed' },
      });
      for (const link of contract.assets) {
        await tx.assetEvent.create({
          data: {
            asset_id: link.asset_id,
            contract_id: contract.id,
            type: 'transferred',
            on_date: input.asOf,
            details_json: JSON.stringify({ from: contract.customer_id, to: input.newCustomerId }),
          },
        });
      }
    }
  );
  return { ok: true, contractId: contract.id };
}
