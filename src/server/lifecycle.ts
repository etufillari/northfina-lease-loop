// During-contract actions: early exit (tier re-price), end-of-term buy or return, and the
// buy-at-end opt-in. The maths lives in src/domain/early-exit.ts; this file counts what has
// been invoiced, writes the outcome in one audited transaction and stamps the passport.
import { loadCoefficientTable, loadVatRates } from '@/data/load';
import { BUYOUT_PAYMENT_DAYS } from '@/domain/buyout';
import { addDays, addMonthsClamped, previousDay } from '@/domain/calendar';
import { holdUntil } from '@/domain/holds';
import { earlyExitQuote, type EarlyExitBreakdown } from '@/domain/early-exit';
import { vatCents, vatRateOn } from '@/domain/vat';
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit } from '@/server/audit';

type Db = PrismaClient;

/** The day after the last lease period: from here on the term is over. */
export function termEndsOn(contract: { start_date: string; term_months: number }): string {
  return previousDay(addMonthsClamped(contract.start_date, contract.term_months));
}

async function loadActiveContract(db: Db, id: string) {
  const contract = await db.contract.findUnique({
    where: { id },
    include: { invoices: { orderBy: { number: 'asc' } }, assets: true },
  });
  if (!contract) return { error: 'not_found' as const, contract: null };
  if (contract.status !== 'active') return { error: 'not_active' as const, contract: null };
  return { error: null, contract };
}

export type ExitPreview = {
  breakdown: EarlyExitBreakdown;
  termEndsOn: string;
};

export type ExitPreviewResult =
  | { ok: true; preview: ExitPreview }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'not_active'
        | 'not_started'
        | 'term_already_over'
        | 'no_vat_rate_on_date'
        | 'unpriceable_amount'
        | 'bad_used_months';
    };

/** The card-8 calculation, shown to the customer BEFORE they confirm anything. */
export async function earlyExitPreview(
  db: Db,
  id: string,
  asOf: string
): Promise<ExitPreviewResult> {
  const loaded = await loadActiveContract(db, id);
  if (loaded.error !== null) return { ok: false, reason: loaded.error };
  const { contract } = loaded;
  if (asOf < contract.start_date) return { ok: false, reason: 'not_started' };
  if (asOf > termEndsOn(contract)) return { ok: false, reason: 'term_already_over' };

  // Billed in advance: the started months of use are exactly the lease invoices due by now.
  const invoiced = contract.invoices.filter((i) => i.type === 'lease' && i.due_date <= asOf);
  const [table, vatRates] = await Promise.all([loadCoefficientTable(), loadVatRates()]);
  const result = earlyExitQuote({
    contract: {
      financedCents: contract.financed_cents,
      termMonths: contract.term_months,
      netTotalCents: contract.net_total_cents,
    },
    usedMonths: invoiced.length,
    paidNetCents: invoiced.reduce((sum, i) => sum + i.net_cents, 0),
    exitDate: asOf,
    table,
    vatRates,
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, preview: { breakdown: result.breakdown, termEndsOn: termEndsOn(contract) } };
}

/** Confirms the exit: ends the contract, issues the exit invoice, returns the asset. */
export async function executeEarlyExit(
  db: Db,
  input: { contractId: string; actor: string; asOf: string }
): Promise<ExitPreviewResult> {
  const previewed = await earlyExitPreview(db, input.contractId, input.asOf);
  if (!previewed.ok) return previewed;
  const { breakdown } = previewed.preview;
  const loaded = await loadActiveContract(db, input.contractId);
  if (loaded.error !== null) return { ok: false, reason: loaded.error };

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'contract.early_exit',
      entityType: 'contract',
      entityId: input.contractId,
      details: {
        usedMonths: breakdown.usedMonths,
        coveringTermMonths: breakdown.coveringTermMonths,
        exitTotalCents: breakdown.exitTotalCents,
      },
    },
    async (tx) => {
      const row = loaded.contract;
      await tx.contract.update({
        where: { id: input.contractId },
        data: { status: 'ended_early_exit', ended_on: input.asOf, end_reason: 'early_exit' },
      });
      if (breakdown.exitNetCents > 0) {
        await tx.invoice.create({
          data: {
            contract_id: input.contractId,
            number: row.invoices.length + 1,
            type: 'early_exit',
            due_date: addDays(input.asOf, 30),
            net_cents: breakdown.exitNetCents,
            vat_rate_bp: Math.round(breakdown.vatRatePercent * 100),
            vat_cents: breakdown.exitVatCents,
            total_cents: breakdown.exitTotalCents,
          },
        });
      }
      for (const link of row.assets) {
        await tx.asset.update({ where: { id: link.asset_id }, data: { status: 'returned' } });
        await tx.assetEvent.create({
          data: {
            asset_id: link.asset_id,
            contract_id: input.contractId,
            type: 'returned',
            on_date: input.asOf,
            details_json: JSON.stringify({
              reason: 'early_exit',
              usedMonths: breakdown.usedMonths,
            }),
          },
        });
      }
    }
  );
  return previewed;
}

export type EndOfTermResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'not_active' | 'term_not_ended' | 'no_vat_rate_on_date' };

/**
 * At (or after) the term's end the customer buys the item or returns it. Buying issues the
 * buyout invoice with 30 days to pay; it never counts against the 30 % affordability rule.
 */
export async function endOfTerm(
  db: Db,
  input: { contractId: string; action: 'buy' | 'return'; actor: string; asOf: string }
): Promise<EndOfTermResult> {
  const loaded = await loadActiveContract(db, input.contractId);
  if (loaded.error !== null) return { ok: false, reason: loaded.error };
  const { contract } = loaded;
  if (input.asOf < termEndsOn(contract)) return { ok: false, reason: 'term_not_ended' };

  const vatRates = await loadVatRates();
  const vat = vatRateOn(vatRates, input.asOf);
  if (!vat.ok) return { ok: false, reason: vat.reason };

  await withAudit(
    db,
    {
      actor: input.actor,
      action: input.action === 'buy' ? 'contract.bought_out' : 'contract.returned',
      entityType: 'contract',
      entityId: input.contractId,
      details: { asOf: input.asOf },
    },
    async (tx) => {
      await tx.contract.update({
        where: { id: input.contractId },
        data: {
          status: input.action === 'buy' ? 'ended_bought' : 'ended_returned',
          ended_on: input.asOf,
          end_reason: input.action === 'buy' ? 'buyout' : 'returned',
        },
      });
      if (input.action === 'buy') {
        // A bought item cannot pass to a nominated successor.
        await tx.reservation.updateMany({
          where: {
            asset_id: { in: contract.assets.map((a) => a.asset_id) },
            kind: 'nomination',
            active: true,
          },
          data: { active: false },
        });
        const net = contract.buyout_net_cents;
        await tx.invoice.create({
          data: {
            contract_id: input.contractId,
            number: contract.invoices.length + 1,
            type: 'buyout',
            due_date: addDays(input.asOf, BUYOUT_PAYMENT_DAYS),
            net_cents: net,
            vat_rate_bp: vat.rateBasisPoints,
            vat_cents: vatCents(net, vat.rateBasisPoints),
            total_cents: net + vatCents(net, vat.rateBasisPoints),
          },
        });
      }
      for (const link of contract.assets) {
        await tx.asset.update({
          where: { id: link.asset_id },
          data: { status: input.action === 'buy' ? 'sold' : 'returned' },
        });
        await tx.assetEvent.create({
          data: {
            asset_id: link.asset_id,
            contract_id: input.contractId,
            type: input.action === 'buy' ? 'bought' : 'returned',
            on_date: input.asOf,
            details_json: JSON.stringify({ reason: 'end_of_term' }),
          },
        });
      }
    }
  );
  return { ok: true };
}

export type NominateResult =
  | { ok: true; nomineeCustomerId: string }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'bad_status'
        | 'term_not_ended'
        | 'buying'
        | 'unknown_nominee'
        | 'self_nomination';
    };

/**
 * "Pass it on", route (b): at (or after) the end of the term the customer names a
 * successor, who may apply for a new lease on the item and skips the waiting list. The
 * skip is explicit and logged, so the FCFS fairness story stays honest (docs/DECISIONS.md).
 *
 * Only from the last day of the term (a 7-day nomination made mid-term would lapse years
 * before it could be used), never for an item the lessee has chosen to buy, only for an
 * existing customer other than the lessee, and one at a time: nominating again replaces
 * the earlier nomination.
 */
export async function nominateSuccessor(
  db: Db,
  input: { contractId: string; email: string; actor: string; asOf: string }
): Promise<NominateResult> {
  const contract = await db.contract.findUnique({
    where: { id: input.contractId },
    include: { assets: true },
  });
  if (!contract) return { ok: false, reason: 'not_found' };
  if (contract.status !== 'active' && contract.status !== 'ended_returned') {
    return { ok: false, reason: 'bad_status' };
  }
  if (contract.status === 'active' && input.asOf < termEndsOn(contract)) {
    return { ok: false, reason: 'term_not_ended' };
  }
  if (contract.purchase_at_end) return { ok: false, reason: 'buying' };
  const nominee = await db.customer.findFirst({ where: { email: input.email } });
  if (!nominee) return { ok: false, reason: 'unknown_nominee' };
  if (nominee.id === contract.customer_id) return { ok: false, reason: 'self_nomination' };
  const assetIds = contract.assets.map((a) => a.asset_id);

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'contract.successor_nominated',
      entityType: 'contract',
      entityId: input.contractId,
      details: { email: input.email, nomineeCustomerId: nominee.id },
    },
    async (tx) => {
      await tx.reservation.updateMany({
        where: { asset_id: { in: assetIds }, kind: 'nomination', active: true },
        data: { active: false },
      });
      for (const link of contract.assets) {
        await tx.reservation.create({
          data: {
            asset_id: link.asset_id,
            customer_id: nominee.id,
            kind: 'nomination',
            until: holdUntil('nomination', input.asOf),
          },
        });
        await tx.assetEvent.create({
          data: {
            asset_id: link.asset_id,
            contract_id: contract.id,
            type: 'nominated',
            on_date: input.asOf,
            details_json: JSON.stringify({ email: input.email, skipsWaitingList: true }),
          },
        });
      }
    }
  );
  return { ok: true, nomineeCustomerId: nominee.id };
}

export type BuyoutOptionResult =
  { ok: true } | { ok: false; reason: 'not_found' | 'not_active' | 'nominated' };

/**
 * The mid-lease "I want to buy it at the end" opt-in (excluded from affordability). Not
 * while a successor is nominated: the item cannot go to both.
 */
export async function setBuyoutOption(
  db: Db,
  input: { contractId: string; optIn: boolean; actor: string }
): Promise<BuyoutOptionResult> {
  const loaded = await loadActiveContract(db, input.contractId);
  if (loaded.error !== null) return { ok: false, reason: loaded.error };
  if (input.optIn) {
    const nominated = await db.reservation.count({
      where: {
        asset_id: { in: loaded.contract.assets.map((a) => a.asset_id) },
        kind: 'nomination',
        active: true,
      },
    });
    if (nominated > 0) return { ok: false, reason: 'nominated' };
  }
  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'contract.buyout_option_set',
      entityType: 'contract',
      entityId: input.contractId,
      details: { optIn: input.optIn },
    },
    (tx) =>
      tx.contract.update({
        where: { id: input.contractId },
        data: { purchase_at_end: input.optIn },
      })
  );
  return { ok: true };
}
