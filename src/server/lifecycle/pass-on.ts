import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Asset as AssetRow, Contract as ContractRow } from '@/generated/prisma/client';
import { assetConditionSchema, isoDateSchema } from '@/data/schemas';
import {
  loadCoefficientTable,
  loadPriceLists,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';
import {
  offerForRecipient,
  passOnOptionsFor,
  type PassOnFailure,
  type PassOnOptions,
  type PassOnRecipient,
} from '@/domain/lifecycle/pass-on';
import type { MatchPricing } from '@/domain/second-life/second-life-matching';
import type { TransactionClient } from '../audit';
import { toAsset } from '../assets/assets';
import type { PrismaClient } from '../prisma-client';

export const handoverReportFields = {
  condition: assetConditionSchema,
  usageValue: z.number().int().nonnegative(),
};

export const passOnRecipientSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('waiting_list'), requestId: z.string().min(1) }),
  z.strictObject({
    type: z.literal('named'),
    name: z.string().trim().min(1).max(100),
    email: z.email(),
  }),
]);

export const passOnPreviewRequestSchema = z.strictObject({
  ...handoverReportFields,
  handoverOn: isoDateSchema,
});
export type PassOnPreviewRequest = z.infer<typeof passOnPreviewRequestSchema>;

export type PassOnDetails = {
  condition: z.infer<typeof assetConditionSchema>;
  usageValue: number;
  recipient: PassOnRecipient;
  completedOn: string;
  actor: string;
};

export type PassOnServiceFailure = PassOnFailure | { ok: false; reason: 'recipient_not_eligible' };

export type PassOnPreviewResult =
  | PassOnOptions
  | PassOnFailure
  | { ok: false; reason: 'contract_not_found' }
  | { ok: false; reason: 'contract_not_active'; status: string };

export type ResolvedPassOn = { ok: true; options: PassOnOptions; pricing: MatchPricing };

/** A waiting-list id, or a generated one for a person the customer named. */
function requestIdFor(recipient: PassOnRecipient, matchId: string): string {
  return recipient.type === 'waiting_list' ? recipient.requestId : `named:${matchId}`;
}

async function optionsFor(
  db: PrismaClient | TransactionClient,
  asset: AssetRow,
  report: { condition: PassOnDetails['condition']; usageValue: number },
  handoverOn: string
): Promise<PassOnOptions | PassOnFailure> {
  const [demand, priceLists, curves, coefficientTable, refurbishmentCosts, claimed] =
    await Promise.all([
      loadSecondLifeDemand(),
      loadPriceLists(),
      loadResidualCurves(),
      loadCoefficientTable(),
      loadRefurbishmentCosts(),
      db.secondLifeMatch.findMany({ select: { request_id: true } }),
    ]);
  const claimedIds = new Set(claimed.map((row) => row.request_id));

  return passOnOptionsFor({
    asset: toAsset(asset),
    handover: report,
    handoverOn,
    demand: demand.filter((request) => !claimedIds.has(request.id)),
    priceLists,
    curves,
    coefficientTable,
    refurbishmentCosts,
  });
}

/** Shows who can take the item next, and at what rent, without changing any data. */
export async function previewPassOn(
  db: PrismaClient,
  contractId: string,
  input: PassOnPreviewRequest
): Promise<PassOnPreviewResult> {
  const contract = await db.contract.findUnique({
    where: { id: contractId },
    include: { asset: true },
  });
  if (!contract) return { ok: false, reason: 'contract_not_found' };
  if (contract.status !== 'active') {
    return { ok: false, reason: 'contract_not_active', status: contract.status };
  }
  return optionsFor(db, contract.asset, input, input.handoverOn);
}

/** Rechecks the chosen person inside the transaction, so a claimed entry cannot be reused. */
export async function resolvePassOn(
  tx: TransactionClient,
  asset: AssetRow,
  details: PassOnDetails
): Promise<ResolvedPassOn | PassOnServiceFailure> {
  const options = await optionsFor(tx, asset, details, details.completedOn);
  if (!options.ok) return options;
  const pricing = offerForRecipient(options, details.recipient);
  if (!pricing) return { ok: false, reason: 'recipient_not_eligible' };
  return { ok: true, options, pricing };
}

/** Reserves the item for the next person and writes the second-life match. */
export async function recordPassOn(
  tx: TransactionClient,
  contract: ContractRow,
  details: PassOnDetails,
  resolved: ResolvedPassOn
) {
  const { recipient } = details;
  const { pricing, options } = resolved;
  const matchId = randomUUID();
  const request =
    recipient.type === 'waiting_list'
      ? options.waitingList.find((entry) => entry.request.id === recipient.requestId)?.request
      : null;

  await tx.asset.update({
    where: { id: contract.asset_id },
    data: {
      status: 'reserved',
      condition: details.condition,
      usage_value: details.usageValue,
      previous_lives: { increment: 1 },
    },
  });
  await tx.secondLifeMatch.create({
    data: {
      id: matchId,
      asset_id: contract.asset_id,
      request_id: requestIdFor(recipient, matchId),
      status: 'accepted',
      matched_on: details.completedOn,
      actor: details.actor,
      market_value_cents: pricing.marketValueCents,
      term_months: pricing.termMonths,
      monthly_net_rent_cents: pricing.monthlyNetRentCents,
      pricing_snapshot_json: JSON.stringify(pricing),
      request_snapshot_json: JSON.stringify(request ?? { type: 'named' }),
      from_contract_id: contract.id,
      recipient_name: recipient.type === 'named' ? recipient.name : null,
      recipient_email: recipient.type === 'named' ? recipient.email : null,
    },
  });

  // The passport keeps only what the next person may see, so no names or emails here.
  return {
    matchId,
    recipientType: recipient.type,
    monthlyNetRentCents: pricing.monthlyNetRentCents,
    termMonths: pricing.termMonths,
    marketValueCents: pricing.marketValueCents,
    mandatorySteps: options.mandatorySteps,
  };
}
