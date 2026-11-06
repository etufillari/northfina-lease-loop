import type { AssetCondition, CoefficientTable, SecondLifeRequest } from '@/data/schemas';
import { isIsoDate } from './calendar';
import { compareRefurbishmentPlans } from './refurbishment-options';
import type { RefurbishmentTask } from './lifecycle';
import { calculatePrice } from './pricing';

export type MatchCandidate = {
  requestId: string;
  condition: AssetCondition;
  termMonths: number;
  neededBy: string;
  budgetNetCents: number;
  netPriceCents: number | null;
  monthlyNetCents: number | null;
  workNetCents: number | null;
  netRecoveryCents: number | null;
  tasks: RefurbishmentTask[];
  reasons: string[];
};

export type MatchingInput = Parameters<typeof compareRefurbishmentPlans>[0] & {
  table: CoefficientTable;
  requests: readonly SecondLifeRequest[];
  onDate: string;
  readyOn: string;
  allocatedRequestIds?: readonly string[];
  unidentifiedRequestIds?: readonly string[];
  incompatibleReservationIds?: readonly string[];
};

/**
 * Asking price = estimated post-repair market value; no repair surcharge, zero down.
 * Feasible means required work is known, recovery is non-negative, and every
 * customer constraint is met. Estimates never establish repair completion.
 * Priority: earliest deadline, least work cost, then request ID and condition.
 * IDs provide a stable tie-break, not an invented registration timestamp.
 */
export function matchSecondLife(input: MatchingInput): {
  candidates: MatchCandidate[];
  recommendation: MatchCandidate | null;
} {
  if (!isIsoDate(input.onDate) || !isIsoDate(input.readyOn) || input.readyOn < input.onDate) {
    throw new RangeError('matching dates must be real ISO dates, with readiness not in the past');
  }
  if (new Set(input.requests.map((request) => request.id)).size !== input.requests.length) {
    throw new RangeError('waiting-list identifiers must be unique');
  }
  const conditions: readonly AssetCondition[] = ['new', 'like_new', 'good', 'fair', 'poor'];
  const { options } = compareRefurbishmentPlans(input);
  const candidates = input.requests.flatMap((request) => {
    if (!isIsoDate(request.needed_by)) throw new RangeError('deadline must be a real ISO date');
    if (
      !Number.isSafeInteger(request.max_monthly_net_rent_cents) ||
      request.max_monthly_net_rent_cents < 0
    ) {
      throw new RangeError('budget must be non-negative safe integer cents');
    }
    return options.map((option): MatchCandidate => {
      const reasons: string[] = [];
      if (input.unidentifiedRequestIds?.includes(request.id)) reasons.push('identity_unknown');
      if (input.incompatibleReservationIds?.includes(request.id))
        reasons.push('reserved_for_other');
      if (input.allocatedRequestIds?.includes(request.id)) reasons.push('allocated');
      if (input.asset.status !== 'returned') reasons.push('not_returned');
      if (request.category !== input.asset.category) reasons.push('category');
      if (conditions.indexOf(option.condition) > conditions.indexOf(request.min_condition))
        reasons.push('condition');
      if (input.readyOn > request.needed_by) reasons.push('deadline');
      if (!option.work.ok) reasons.push(option.work.reason);
      if (!option.valuation.ok) reasons.push(option.valuation.reason);
      if (option.economicallyViable === false) reasons.push('uneconomic');
      const price =
        option.valuation.ok && input.readyOn >= input.table.valid_from
          ? calculatePrice({
              listPriceCents: option.valuation.marketValueCents,
              downPaymentCents: 0,
              termMonths: request.preferred_term_months,
              table: input.table,
            })
          : null;
      if (!price?.ok) reasons.push('pricing_unavailable');
      if (price?.ok && price.terms.monthlyNetCents > request.max_monthly_net_rent_cents)
        reasons.push('budget');
      return {
        requestId: request.id,
        condition: option.condition,
        termMonths: request.preferred_term_months,
        neededBy: request.needed_by,
        budgetNetCents: request.max_monthly_net_rent_cents,
        netPriceCents: option.valuation.ok ? option.valuation.marketValueCents : null,
        monthlyNetCents: price?.ok ? price.terms.monthlyNetCents : null,
        workNetCents: option.work.ok ? option.work.totalNetCents : null,
        netRecoveryCents: option.netRecoveryCents,
        tasks: option.work.ok ? option.work.tasks : [],
        reasons,
      };
    });
  });
  const ordered = candidates
    // Identity is an allocation constraint, not a suitability constraint.
    .filter((candidate) => candidate.reasons.every((reason) => reason === 'identity_unknown'))
    .sort((a, b) => {
      if (a.neededBy !== b.neededBy) return a.neededBy < b.neededBy ? -1 : 1;
      if (a.workNetCents !== b.workNetCents) return a.workNetCents! - b.workNetCents!;
      if (a.requestId !== b.requestId) return a.requestId < b.requestId ? -1 : 1;
      return conditions.indexOf(a.condition) - conditions.indexOf(b.condition);
    });
  return { candidates, recommendation: ordered[0] ?? null };
}
