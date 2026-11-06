// Pass it on, then hand it over in one click (#65, light). On the handover day the item passed on
// is checked, refurbished to the condition the next person needs, re-listed at its second-life
// price, and a quote is stored for them. They still apply like anyone else: no contract is made
// here, so the question flow and the eligibility check still run when they sign.
import { handOverPlan } from '@/domain/pass-on';
import { getContractEnding } from './contract-endings';
import { getContract } from './contracts';
import type { LeaseDataPack } from './lease-data';
import type { PrismaClient } from './prisma-client';
import { createQuote, type CreateQuoteRefusal } from './quotes';
import {
  relistAsset,
  secondLifeView,
  type RelistRefusal,
  type SecondLifeDataPack,
} from './second-life';

export interface HandOverInput {
  contractId: number;
  /** The effective today (D-030). */
  today: string;
}

/** Every reason `handOver` refuses; `POST /api/contracts/:id/hand-over` answers each in upper case. */
export type HandOverRefusal =
  | 'contract_not_found'
  | 'not_passed_on'
  | 'already_handed_over'
  | 'too_early'
  | 'no_price'
  | 'waiting_list_not_a_match'
  | RelistRefusal
  | CreateQuoteRefusal;

export type HandOverResult =
  { ok: true; quoteId: number } | { ok: false; reason: HandOverRefusal; opensOn?: string };

/** The id of the asset's newest contract: only that one's ending can hand the item over. */
export async function latestContractId(db: PrismaClient, assetId: string): Promise<number | null> {
  const latest = await db.contract.findFirst({
    where: { asset_id: assetId },
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  return latest?.id ?? null;
}

/**
 * Re-lists the item passed on and stores a quote for the next person. Two audited transactions
 * (`asset.relisted`, then `quote.created`); `withAudit` can't nest them. The price is checked
 * before the first one, so the second fails only on a race, and then the item is simply
 * available to quote from its page.
 */
export async function handOver(
  db: PrismaClient,
  data: {
    lease: Pick<LeaseDataPack, 'priceLists' | 'coefficientTable'>;
    secondLife: SecondLifeDataPack;
  },
  input: HandOverInput
): Promise<HandOverResult> {
  const found = await getContract(db, input.contractId);
  if (!found) return { ok: false, reason: 'contract_not_found' };
  const ending = await getContractEnding(db, input.contractId);
  if (ending?.kind !== 'pass_on' || !ending.nextLessee) {
    return { ok: false, reason: 'not_passed_on' };
  }

  const { assetId, termMonths } = found.contract;
  // Re-listed by hand, leased and returned again since: this ending no longer decides.
  if ((await latestContractId(db, assetId)) !== input.contractId) {
    return { ok: false, reason: 'already_handed_over' };
  }
  const view = await secondLifeView(db, data.secondLife, assetId, input.today);
  if (!view) return { ok: false, reason: 'already_handed_over' };

  const plan = handOverPlan({
    nextLessee: ending.nextLessee,
    contractTermMonths: termMonths,
    today: input.today,
    handoverDate: ending.effectiveDate,
    ranked: view.match.ranked,
    options: view.options,
  });
  if (!plan.ok) return plan;

  const relisted = await relistAsset(db, data.secondLife, {
    assetId,
    target: plan.target,
    today: input.today,
    // No login in the starter: the back office re-lists, as on the item's page.
    actor: 'back-office',
  });
  if (!relisted.ok) {
    // A double click or a race: someone else re-listed it first.
    return {
      ok: false,
      reason: relisted.reason === 'asset_not_returned' ? 'already_handed_over' : relisted.reason,
    };
  }

  const quote = await createQuote(db, data.lease, {
    assetId,
    termMonths: plan.termMonths,
    downPaymentCents: 0,
    today: input.today,
    actor: 'customer',
  });
  return quote.ok ? { ok: true, quoteId: quote.id } : quote;
}
