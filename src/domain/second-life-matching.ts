import type { Asset, AssetCondition, CoefficientTable, SecondLifeRequest } from '../data/schemas';

export type SecondLifeMatchInput = {
  asset: Asset;
  resultingCondition: AssetCondition;
  marketValueCents: number;
  availableDate: string;
  requests: SecondLifeRequest[];
  coefficientTable: CoefficientTable;
};

export type SecondLifeRejectionReason =
  | 'category_mismatch'
  | 'condition_below_minimum'
  | 'not_available_by_deadline'
  | 'over_budget'
  | 'unsupported_term';

export type SecondLifeMatch = {
  assetId: string;
  requestId: string;
  who: string;
  category: Asset['category'];
  condition: AssetCondition;
  minCondition: AssetCondition;
  marketValueCents: number;
  monthlyNetRentCents: number;
  termMonths: number;
  neededBy: string;
};

export type SecondLifeRejection = {
  requestId: string;
  reason: SecondLifeRejectionReason;
};

export type SecondLifeMatchingResult =
  | {
      ok: true;
      matches: SecondLifeMatch[];
      rejected: SecondLifeRejection[];
    }
  | {
      ok: false;
      reason: 'asset_not_returned' | 'invalid_input' | 'invalid_date' | 'missing_coefficient_band';
    };

const conditionRank: Record<AssetCondition, number> = {
  poor: 0,
  fair: 1,
  good: 2,
  like_new: 3,
  new: 4,
};

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return day <= (daysPerMonth[month - 1] ?? 0);
}

function calculateMonthlyNetRent(
  marketValueCents: number,
  termMonths: number,
  coefficientTable: CoefficientTable
): number | null {
  const band = coefficientTable.bands.find(
    (candidate) =>
      marketValueCents >= candidate.min_financed_cents &&
      marketValueCents <= candidate.max_financed_cents
  );

  if (!band) {
    return null;
  }

  const factor = band.monthly_factor_by_term[String(termMonths)];

  if (factor === undefined || !Number.isFinite(factor) || factor <= 0) {
    return null;
  }

  return Math.round(marketValueCents * factor);
}

/**
 * Matches one refurbished returned asset against waiting-list requests.
 *
 * Rent is calculated from the used market value, using each request's
 * preferred lease term and the supplied coefficient table.
 *
 * Ranking:
 * 1. Earliest needed-by date.
 * 2. Highest customer minimum-condition requirement.
 * 3. Request ID alphabetically.
 *
 * The function does not reserve the asset or change any source data.
 */
export function matchSecondLifeDemand(input: SecondLifeMatchInput): SecondLifeMatchingResult {
  const { asset, resultingCondition, marketValueCents, availableDate, requests, coefficientTable } =
    input;

  if (asset.status !== 'returned') {
    return { ok: false, reason: 'asset_not_returned' };
  }

  if (
    !Number.isSafeInteger(marketValueCents) ||
    marketValueCents < 0 ||
    !Number.isInteger(conditionRank[resultingCondition])
  ) {
    return { ok: false, reason: 'invalid_input' };
  }

  if (!isValidIsoDate(availableDate)) {
    return { ok: false, reason: 'invalid_date' };
  }

  const bandExists = coefficientTable.bands.some(
    (band) =>
      marketValueCents >= band.min_financed_cents && marketValueCents <= band.max_financed_cents
  );

  if (!bandExists) {
    return { ok: false, reason: 'missing_coefficient_band' };
  }

  const matches: SecondLifeMatch[] = [];
  const rejected: SecondLifeRejection[] = [];

  for (const request of requests) {
    if (request.category !== asset.category) {
      rejected.push({
        requestId: request.id,
        reason: 'category_mismatch',
      });
      continue;
    }

    if (conditionRank[resultingCondition] < conditionRank[request.min_condition]) {
      rejected.push({
        requestId: request.id,
        reason: 'condition_below_minimum',
      });
      continue;
    }

    if (!isValidIsoDate(request.needed_by)) {
      rejected.push({
        requestId: request.id,
        reason: 'not_available_by_deadline',
      });
      continue;
    }

    if (availableDate > request.needed_by) {
      rejected.push({
        requestId: request.id,
        reason: 'not_available_by_deadline',
      });
      continue;
    }

    const monthlyNetRentCents = calculateMonthlyNetRent(
      marketValueCents,
      request.preferred_term_months,
      coefficientTable
    );

    if (monthlyNetRentCents === null) {
      rejected.push({
        requestId: request.id,
        reason: 'unsupported_term',
      });
      continue;
    }

    if (monthlyNetRentCents > request.max_monthly_net_rent_cents) {
      rejected.push({
        requestId: request.id,
        reason: 'over_budget',
      });
      continue;
    }

    matches.push({
      assetId: asset.id,
      requestId: request.id,
      who: request.who,
      category: asset.category,
      condition: resultingCondition,
      minCondition: request.min_condition,
      marketValueCents,
      monthlyNetRentCents,
      termMonths: request.preferred_term_months,
      neededBy: request.needed_by,
    });
  }

  matches.sort((a, b) => {
    const dateComparison = a.neededBy.localeCompare(b.neededBy);

    if (dateComparison !== 0) {
      return dateComparison;
    }

    const conditionComparison = conditionRank[b.minCondition] - conditionRank[a.minCondition];

    if (conditionComparison !== 0) {
      return conditionComparison;
    }

    return a.requestId.localeCompare(b.requestId);
  });

  return {
    ok: true,
    matches,
    rejected,
  };
}
