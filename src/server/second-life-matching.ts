import { z } from 'zod';
import { secondLifeRequestSchema } from '@/data/schemas';
import {
  loadCoefficientTable,
  loadCustomers,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';
import { matchingSelectionSchema, type MatchingPreviewInput } from '@/data/second-life-schemas';
import { matchSecondLife, type MatchCandidate } from '@/domain/second-life-matching';
import { ApiError } from './api-response';
import { toAsset } from './assets';
import type { TransactionClient } from './audit';
import { requireOperator, type DemoContext } from './demo-context';
import type { PrismaClient } from './prisma-client';
import { readMaintenance } from './spine-maintenance';
import { matchingValuationBaseline } from './valuation-baseline';

const auditDetails = z.object({ matching: matchingSelectionSchema.optional() });

/** Read-only projection; the relist transaction calls this again before allocating. */
export async function previewSecondLife(
  db: PrismaClient | TransactionClient,
  context: DemoContext,
  assetId: string,
  input: MatchingPreviewInput
) {
  requireOperator(context);
  if (input.readyOn < context.businessDate)
    throw new ApiError(422, 'MATCH_CHANGED', 'Refresh the readiness date');
  const [row, release, audits, table, costs, rules, requests, registered, customers] =
    await Promise.all([
      db.asset.findUnique({ where: { id: assetId } }),
      db.assetRelease.findUnique({ where: { asset_id: assetId } }),
      db.auditLog.findMany({ where: { action: 'asset.relisted' }, select: { details_json: true } }),
      loadCoefficientTable(),
      loadRefurbishmentCosts(),
      loadResidualCurves(),
      loadSecondLifeDemand(),
      db.waitingRequest.findMany({
        where: { status: 'pending', submitted_on: { lte: context.businessDate } },
      }),
      loadCustomers(),
    ]);
  if (!row) throw new ApiError(404, 'ASSET_NOT_FOUND', 'The item was not found');
  const valuation = await matchingValuationBaseline(db, assetId, input);
  const allocatedRequestIds = audits.flatMap((row) => {
    const parsed = auditDetails.safeParse(row.details_json ? JSON.parse(row.details_json) : {});
    return parsed.success && parsed.data.matching ? [parsed.data.matching.waitingRequestId] : [];
  });
  const identities = new Map(
    [...requests, ...registered].map((request) => [
      request.id,
      {
        customerId: customers.some((customer) => customer.id === request.customer_id)
          ? request.customer_id
          : null,
        waitingRevision: 'revision' in request ? request.revision : null,
        customerName:
          customers.find((customer) => customer.id === request.customer_id)?.name ?? null,
      },
    ])
  );
  const result = matchSecondLife({
    ...input,
    ageMonths: valuation.ageMonths,
    originalPriceCents: valuation.originalPriceCents,
    asset: toAsset(row),
    table,
    costs,
    rules,
    requests: [
      ...requests,
      ...registered.map((request) =>
        secondLifeRequestSchema.parse({
          id: request.id,
          category: request.category,
          min_condition: request.min_condition,
          max_monthly_net_rent_cents: request.max_monthly_net_rent_cents,
          preferred_term_months: request.preferred_term_months,
          needed_by: request.needed_by,
          who: '',
        })
      ),
    ],
    maintenance: readMaintenance(release),
    onDate: context.businessDate,
    allocatedRequestIds,
    unidentifiedRequestIds: [
      ...[...requests, ...registered]
        .filter((request) => !identities.get(request.id)?.customerName)
        .map((request) => request.id),
    ],
    incompatibleReservationIds: [...requests, ...registered]
      .filter(
        (request) =>
          release?.reserved_for_customer_id &&
          release.reserved_for_customer_id !== identities.get(request.id)?.customerId
      )
      .map((request) => request.id),
  });
  function identified(candidate: MatchCandidate) {
    const identity = identities.get(candidate.requestId);
    return {
      ...candidate,
      customerId: identity?.customerId ?? null,
      waitingRevision: identity?.waitingRevision ?? null,
      customerName: identity?.customerName ?? null,
      imported: requests.some((request) => request.id === candidate.requestId),
    };
  }
  return {
    valuationBaseline: valuation.baseline,
    releaseRevision: release?.revision ?? 0,
    candidates: result.candidates.map(identified),
    recommendation: result.recommendation ? identified(result.recommendation) : null,
  };
}
