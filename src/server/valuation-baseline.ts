import { loadPriceLists } from '@/data/load';
import { valuationBaselineSchema, type ValuationBaseline } from '@/data/valuation-baseline-schemas';
import type { MatchingPreviewInput } from '@/data/second-life-schemas';
import { addMonthsAnchored } from '@/domain/calendar';
import { resolveValuationBaseline, wholeMonthsSince } from '@/domain/valuation-baseline';
import type { TransactionClient } from './audit';
import type { PrismaClient } from './prisma-client';
import { priceTermsSchema } from '@/data/spine-value-schemas';
import { ApiError } from './api-response';

/** Read-only; callers persist the result inside their audited lifecycle transaction. */
export async function readValuationBaseline(
  db: PrismaClient | TransactionClient,
  assetId: string,
  firstLease?: { startDate: string; originalPriceCents: number }
): Promise<ValuationBaseline | null> {
  const [asset, first, priceLists] = await Promise.all([
    db.asset.findUniqueOrThrow({ where: { id: assetId } }),
    db.contract.findFirst({ where: { asset_id: assetId }, orderBy: { life_number: 'asc' } }),
    loadPriceLists(),
  ]);
  const recorded =
    first?.life_number === 1
      ? {
          startDate: first.start_date,
          originalPriceCents: priceTermsSchema.parse(JSON.parse(first.terms_json)).listPriceCents,
        }
      : asset.previous_lives === 0 && asset.usage_value === 0 && asset.condition === 'new'
        ? firstLease
        : undefined;
  return resolveValuationBaseline({
    asset,
    saved: asset.valuation_baseline_json
      ? valuationBaselineSchema.parse(JSON.parse(asset.valuation_baseline_json))
      : null,
    priceLists,
    firstLease: recorded,
  });
}

/** Legacy operator-entered age/price remain explicit assumptions, never verified facts. */
export async function matchingValuationBaseline(
  db: PrismaClient | TransactionClient,
  assetId: string,
  input: MatchingPreviewInput
) {
  let baseline: ValuationBaseline | null;
  if (input.useAutomaticBaseline) {
    baseline = input.baselineCorrection
      ? { ...input.baselineCorrection, source: 'operator_verified' }
      : await readValuationBaseline(db, assetId);
  } else {
    baseline = {
      firstUsedOn: addMonthsAnchored(input.readyOn, -input.ageMonths),
      originalPriceCents: input.originalPriceCents,
      source: 'operator_assumption',
      reason: 'Operator-supplied age and original price.',
    };
  }
  if (!baseline || baseline.firstUsedOn > input.readyOn) {
    throw new ApiError(
      422,
      'VALUATION_BASELINE_UNAVAILABLE',
      'Check the original valuation reference'
    );
  }
  const ageMonths = wholeMonthsSince(baseline.firstUsedOn, input.readyOn);
  if (
    input.useAutomaticBaseline &&
    (ageMonths !== input.ageMonths || baseline.originalPriceCents !== input.originalPriceCents)
  ) {
    throw new ApiError(409, 'MATCH_CHANGED', 'The original valuation reference changed; refresh');
  }
  return { baseline, ageMonths, originalPriceCents: baseline.originalPriceCents };
}
