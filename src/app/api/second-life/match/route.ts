import { z } from 'zod';

import { isoDateSchema, type AssetCondition } from '@/data/schemas';

import type { SecondLifeMatch } from '@/domain/second-life-matching';

import {
  loadCoefficientTable,
  loadPriceLists,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';

import { calculateRefurbishment } from '@/domain/refurbishment';
import { calculateResidualValue } from '@/domain/residual-value';
import { matchSecondLifeDemand } from '@/domain/second-life-matching';
import { listPriceOn } from '@/domain/price-list';
import { ApiError, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { toAsset } from '@/server/assets';

// Original first-lease prices are defined by price-list v1.
const ORIGINAL_PRICE_LIST_DATE = '2026-01-01';

const requestSchema = z.strictObject({
  assetId: z.string().min(1),
  availableDate: isoDateSchema,

  // Required for farm-machine service calculations when usage > 0.
  usageSinceLastService: z.number().int().nonnegative().optional(),
});

const conditionRank: Record<AssetCondition, number> = {
  poor: 0,
  fair: 1,
  good: 2,
  like_new: 3,
  new: 4,
};

type EnrichedMatch = SecondLifeMatch & {
  originalPriceCents: number;
  targetCondition: AssetCondition;
  refurbishment: {
    totalCostCents: number;
    usageReset: boolean;
    actions: {
      id: string;
      costCents: number;
      quantity: number;
    }[];
  };
  valuation: {
    ageMonths: number;
    ageMultiplier: number;
    conditionMultiplier: number;
    usageMultiplier: number;
  };
};

type ServiceRejection = {
  requestId: string;
  reason: string;
};

function getTargetCondition(minCondition: AssetCondition): AssetCondition {
  // A returned item must reach at least Fair.
  // Requests requiring Good or better keep their stricter requirement.
  if (conditionRank[minCondition] < conditionRank.good) {
    return 'fair';
  }

  return minCondition;
}

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, requestSchema);

  // 1. Find the physical asset in the database.
  const row = await db.asset.findUnique({
    where: { id: body.assetId },
  });

  if (!row) {
    throw new ApiError(404, 'ASSET_NOT_FOUND', 'The asset was not found');
  }

  const asset = toAsset(row);

  if (asset.status !== 'returned') {
    throw new ApiError(
      409,
      'ASSET_NOT_RETURNED',
      'Only returned assets can enter the Second Life matching process'
    );
  }

  // 2. Load the validated data needed for the calculations.
  const [demand, priceLists, curves, coefficientTable, refurbishmentCosts] = await Promise.all([
    loadSecondLifeDemand(),
    loadPriceLists(),
    loadResidualCurves(),
    loadCoefficientTable(),
    loadRefurbishmentCosts(),
  ]);

  // 3. Find the original net list price from price-list v1.
  const originalPrice = listPriceOn(priceLists, asset.id, ORIGINAL_PRICE_LIST_DATE);

  if (!originalPrice.ok) {
    throw new ApiError(
      422,
      'ORIGINAL_PRICE_NOT_FOUND',
      'The original first-lease price could not be found',
      originalPrice
    );
  }

  const matches: EnrichedMatch[] = [];
  const rejected: ServiceRejection[] = [];

  // 4. Evaluate each waiting-list request independently.
  for (const waitingRequest of demand) {
    if (waitingRequest.category !== asset.category) {
      rejected.push({
        requestId: waitingRequest.id,
        reason: 'category_mismatch',
      });
      continue;
    }

    // Each customer can require a different refurbishment level.
    const targetCondition = getTargetCondition(waitingRequest.min_condition);

    // 5. Calculate refurbishment for this customer's requirement.
    const refurbishment = calculateRefurbishment({
      asset,
      costs: refurbishmentCosts,
      targetCondition,
      usageSinceLastService: body.usageSinceLastService,
    });

    if (!refurbishment.ok) {
      rejected.push({
        requestId: waitingRequest.id,
        reason: refurbishment.reason,
      });
      continue;
    }

    // 6. Calculate residual value after refurbishment.
    // Battery replacement can reset usage, but not asset age.
    const valuation = calculateResidualValue({
      category: asset.category,
      originalPriceCents: originalPrice.priceCents,
      modelYear: asset.model_year,
      valuationDate: body.availableDate,
      condition: refurbishment.resultingCondition,
      usage: {
        unit: asset.usage.unit,
        value: refurbishment.resultingUsage,
      },
      curves,
    });

    if (!valuation.ok) {
      rejected.push({
        requestId: waitingRequest.id,
        reason: `valuation_${valuation.reason}`,
      });
      continue;
    }

    // 7. Run the matching engine for this individual request.
    const matching = matchSecondLifeDemand({
      asset,
      resultingCondition: refurbishment.resultingCondition,
      marketValueCents: valuation.marketValueCents,
      availableDate: body.availableDate,
      requests: [waitingRequest],
      coefficientTable,
    });

    if (!matching.ok) {
      rejected.push({
        requestId: waitingRequest.id,
        reason: matching.reason,
      });
      continue;
    }

    rejected.push(...matching.rejected);

    const match = matching.matches[0];

    if (!match) {
      continue;
    }

    // 8. Include refurbishment and valuation details in the result.
    matches.push({
      ...match,
      originalPriceCents: originalPrice.priceCents,
      targetCondition,
      refurbishment: {
        totalCostCents: refurbishment.totalCostCents,
        usageReset: refurbishment.usageReset,
        actions: refurbishment.actions,
      },
      valuation: {
        ageMonths: valuation.ageMonths,
        ageMultiplier: valuation.ageMultiplier,
        conditionMultiplier: valuation.conditionMultiplier,
        usageMultiplier: valuation.usageMultiplier,
      },
    });
  }

  // 9. Rank all successful matches together.
  matches.sort((a: EnrichedMatch, b: EnrichedMatch) => {
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

  return ok({
    asset: {
      id: asset.id,
      category: asset.category,
      condition: asset.condition,
      status: asset.status,
      usage: asset.usage,
      previousLives: asset.previous_lives,
    },
    availableDate: body.availableDate,
    originalPriceCents: originalPrice.priceCents,
    originalPriceListVersion: originalPrice.priceListVersion,
    matches,
    rejected,
    summary: {
      totalRequests: demand.length,
      matchedRequests: matches.length,
      rejectedRequests: rejected.length,
    },
    reservationCreated: false,
    contractCreated: false,
  });
});
