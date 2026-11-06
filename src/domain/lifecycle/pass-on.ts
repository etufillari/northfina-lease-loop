import type {
  Asset,
  AssetCondition,
  CoefficientTable,
  PriceList,
  RefurbishmentCosts,
  ResidualCurves,
  SecondLifeRequest,
} from '@/data/schemas';
import {
  conditionRank,
  secondLifeMatchesFor,
  type MatchPricing,
  type SecondLifeMatchFailure,
} from '../second-life/second-life-matching';

/**
 * Rules for passing a leased item directly to the next person:
 * - There is no workshop visit. The customer reports condition and usage, and can only
 *   report the same or worse than our records, because the next price depends on it.
 *   Records are not updated during a lease, so a leased item can no longer count as new.
 * - Steps marked mandatory in the refurbishment costs still happen before the handover.
 * - A named person needs at least 'good'. Waiting-list entries set their own minimum.
 * - The price is the used value on the handover date, with no down payment, run through
 *   the normal coefficient table. Waiting-list entries use their preferred term.
 */
export const namedRecipientMinCondition: AssetCondition = 'good';
export const namedRecipientTermMonths = 24;

export type HandoverReport = { condition: AssetCondition; usageValue: number };

export type PassOnRecipient =
  { type: 'waiting_list'; requestId: string } | { type: 'named'; name: string; email: string };

export type PassOnFailure =
  | { ok: false; reason: 'condition_above_recorded'; recorded: AssetCondition }
  | { ok: false; reason: 'usage_below_recorded'; recorded: number }
  | SecondLifeMatchFailure;

export type WaitingListOffer = { request: SecondLifeRequest; pricing: MatchPricing };

export type PassOnOptions = {
  ok: true;
  /** The item as it will be handed over: reported condition and usage, ready to lease. */
  handedOverAsset: Asset;
  mandatorySteps: string[];
  waitingList: WaitingListOffer[];
  /** Null when the item cannot go to a named person, for example below 'good'. */
  named: { pricing: MatchPricing } | null;
};

export type PassOnInput = {
  asset: Asset;
  handover: HandoverReport;
  handoverOn: string;
  demand: readonly SecondLifeRequest[];
  priceLists: readonly PriceList[];
  curves: ResidualCurves;
  coefficientTable: CoefficientTable;
  refurbishmentCosts: RefurbishmentCosts;
};

/** The best condition a customer can report at handover. */
export function handoverConditionCeiling(recorded: AssetCondition): AssetCondition {
  return recorded === 'new' ? 'like_new' : recorded;
}

/** Reads the steps that must happen before an item of this category changes hands. */
export function mandatoryStepsFor(
  category: Asset['category'],
  costs: RefurbishmentCosts
): string[] {
  return costs[category].fixed.flatMap((step) =>
    step.mandatory_before_next_lease ? [step.id] : []
  );
}

/** Works out who can take the item next, and at what rent, without changing anything. */
export function passOnOptionsFor(input: PassOnInput): PassOnOptions | PassOnFailure {
  const { asset, handover, handoverOn } = input;
  if (!Number.isSafeInteger(handover.usageValue) || handover.usageValue < 0) {
    throw new RangeError(`usageValue must be a non-negative whole number`);
  }
  const ceiling = handoverConditionCeiling(asset.condition);
  if (conditionRank[handover.condition] > conditionRank[ceiling]) {
    return { ok: false, reason: 'condition_above_recorded', recorded: ceiling };
  }
  if (handover.usageValue < asset.usage.value) {
    return { ok: false, reason: 'usage_below_recorded', recorded: asset.usage.value };
  }

  const handedOverAsset: Asset = {
    ...asset,
    status: 'available',
    condition: handover.condition,
    usage: { ...asset.usage, value: handover.usageValue },
  };
  const namedRequest: SecondLifeRequest = {
    id: 'named',
    category: asset.category,
    max_monthly_net_rent_cents: Number.MAX_SAFE_INTEGER,
    min_condition: namedRecipientMinCondition,
    preferred_term_months: namedRecipientTermMonths,
    needed_by: handoverOn,
    who: '',
  };

  const matched = secondLifeMatchesFor(
    handedOverAsset,
    [namedRequest, ...input.demand],
    input.priceLists,
    input.curves,
    input.coefficientTable,
    handoverOn
  );
  if (!matched.ok) return matched;

  const named = matched.matches.find((match) => match.request.id === namedRequest.id);
  return {
    ok: true,
    handedOverAsset,
    mandatorySteps: mandatoryStepsFor(asset.category, input.refurbishmentCosts),
    waitingList: matched.matches
      .filter((match) => match.request.id !== namedRequest.id)
      .map(({ request, pricing }) => ({ request, pricing })),
    named: named ? { pricing: named.pricing } : null,
  };
}

/** Finds the priced offer for the chosen person, or null when they cannot take the item. */
export function offerForRecipient(
  options: PassOnOptions,
  recipient: PassOnRecipient
): MatchPricing | null {
  if (recipient.type === 'named') return options.named?.pricing ?? null;
  const offer = options.waitingList.find((entry) => entry.request.id === recipient.requestId);
  return offer?.pricing ?? null;
}
