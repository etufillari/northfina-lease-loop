// Reserving a returned asset for the winner of the second-life decision. The decision is
// recalculated here from the stored data, never taken from the client, and the reservation, the
// asset status change and the audit row are written in one transaction.
import { z } from 'zod';

import { ApiError } from './api-response';
import { withAudit } from './audit';
import type { PrismaClient } from './prisma-client';
import { evaluateSecondLife, secondLifeEvaluationSchema } from './second-life';

export const reserveSecondLifeSchema = secondLifeEvaluationSchema.extend({
  actor: z.string().trim().min(1).max(100),
});
export type ReserveSecondLifeInput = z.infer<typeof reserveSecondLifeSchema>;

type Evaluation = Awaited<ReturnType<typeof evaluateSecondLife>>;

/** Waiting-list requests that already have an asset held for them. */
export async function activeReservedRequestIds(db: PrismaClient): Promise<Set<string>> {
  const rows = await db.secondLifeReservation.findMany({
    where: { status: 'reserved' },
    select: { waiting_request_id: true },
  });
  return new Set(rows.map((row) => row.waiting_request_id));
}

/** The shape the preview route returns. */
export function describeSecondLifeResult(result: Evaluation) {
  const { asset, decision } = result;
  return {
    asset: {
      id: asset.id,
      category: asset.category,
      condition: asset.condition,
      status: asset.status,
      usage: asset.usage,
      previousLives: asset.previous_lives,
    },
    availableDate: result.availableDate,
    originalPriceCents: result.originalPriceCents,
    originalPriceListVersion: result.originalPriceListVersion,
    matches: result.matches,
    decision: {
      refurbish: decision.refurbish,
      reason: decision.reason,
      winnerRequestId: decision.winner?.requestId ?? null,
      comparisons: decision.comparisons,
    },
    rejected: result.rejected,
    summary: {
      totalRequests: result.totalRequests,
      matchedRequests: result.matches.length,
      rejectedRequests: result.rejected.length,
    },
  };
}

/**
 * Holds a `returned` asset for the best viable waiting-list request.
 *
 * Transition: asset `returned` -> `reserved`. Completing the refurbishment later keeps it
 * `reserved` (see assetAfterRefurbishment), so it does not go back to the catalogue.
 */
export async function reserveSecondLife(db: PrismaClient, input: ReserveSecondLifeInput) {
  const { actor, ...evaluationInput } = reserveSecondLifeSchema.parse(input);

  const evaluation = await evaluateSecondLife(
    db,
    evaluationInput,
    await activeReservedRequestIds(db)
  );
  const { decision } = evaluation;
  const winner = decision.winner;

  if (!winner) {
    throw new ApiError(
      409,
      'NO_VIABLE_MATCH',
      'No waiting-list request can be served from this asset.',
      { reason: decision.reason }
    );
  }

  const reservationId = crypto.randomUUID();
  const snapshot = {
    reason: decision.reason,
    ranked: decision.ranked.map((candidate) => ({
      rank: candidate.rank,
      requestId: candidate.requestId,
      neededBy: candidate.neededBy,
      minCondition: candidate.minCondition,
      termMonths: candidate.termMonths,
      monthlyNetRentCents: candidate.monthlyNetRentCents,
      refurbishmentCostCents: candidate.refurbishmentCostCents,
      paybackMonths: candidate.paybackMonths,
      viable: candidate.viable,
    })),
    comparisons: decision.comparisons,
  };

  return withAudit(
    db,
    {
      actor,
      action: 'second_life.reserved',
      entityType: 'second_life_reservation',
      entityId: reservationId,
      details: {
        assetId: evaluation.asset.id,
        waitingRequestId: winner.requestId,
        monthlyNetRentCents: winner.monthlyNetRentCents,
        termMonths: winner.termMonths,
        refurbishmentCostCents: winner.refurbishmentCostCents,
        targetCondition: winner.targetCondition,
        decidedBy: decision.comparisons.map((entry) => entry.decidedBy),
        asset: { status: { from: 'returned', to: 'reserved' } },
      },
    },
    async (tx) => {
      // Conditional on `returned`, so two dealers cannot both reserve the same asset.
      const claimed = await tx.asset.updateMany({
        where: { id: evaluation.asset.id, status: 'returned' },
        data: { status: 'reserved' },
      });
      if (claimed.count !== 1) {
        throw new ApiError(
          409,
          'ASSET_NOT_RETURNED',
          'Only a returned asset can be reserved for the waiting list.'
        );
      }

      // One asset per waiting-list request: another asset may have taken it since we looked.
      const taken = await tx.secondLifeReservation.findFirst({
        where: { waiting_request_id: winner.requestId, status: 'reserved' },
      });
      if (taken) {
        throw new ApiError(
          409,
          'REQUEST_ALREADY_RESERVED',
          'This waiting-list request already has an asset reserved.'
        );
      }

      if (winner.requestId.startsWith('wishlist:')) {
        await tx.wishlistRequest.update({
          where: { id: winner.requestId.slice('wishlist:'.length) },
          data: { status: 'matched' },
        });
      }

      return tx.secondLifeReservation.create({
        data: {
          id: reservationId,
          asset_id: evaluation.asset.id,
          waiting_request_id: winner.requestId,
          who: winner.who,
          status: 'reserved',
          reserved_by: actor,
          available_date: evaluation.availableDate,
          needed_by: winner.neededBy,
          target_condition: winner.targetCondition,
          term_months: winner.termMonths,
          monthly_net_rent_cents: winner.monthlyNetRentCents,
          refurbishment_cost_cents: winner.refurbishmentCostCents,
          payback_months: winner.paybackMonths ?? 0,
          decision_json: JSON.stringify(snapshot),
        },
      });
    }
  );
}
