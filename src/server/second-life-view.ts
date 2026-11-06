// What the dealer screen shows about second life for one asset: the reservation if there is
// one, otherwise a preview of the decision for a returned asset. Read-only.
import { z } from 'zod';

import { assetConditionSchema } from '@/data/schemas';

import type { PrismaClient } from './prisma-client';
import { evaluateSecondLife } from './second-life';
import { activeReservedRequestIds, describeSecondLifeResult } from './second-life-reservations';

// The decision as saved on the reservation by reserveSecondLife().
const decidingRuleSchema = z.enum(['deadline', 'condition_requirement', 'request_id']);
export const reservationSnapshotSchema = z.object({
  reason: z.string(),
  ranked: z.array(
    z.object({
      rank: z.number().int(),
      requestId: z.string(),
      paybackMonths: z.number().int().nullable(),
      viable: z.boolean(),
    })
  ),
  comparisons: z.array(
    z.object({
      winnerRequestId: z.string(),
      otherRequestId: z.string(),
      decidedBy: decidingRuleSchema,
    })
  ),
});

export type SecondLifeSection =
  | {
      kind: 'reserved';
      reservation: {
        id: string;
        waitingRequestId: string;
        who: string;
        reservedBy: string;
        reservedAt: string;
        neededBy: string;
        targetCondition: z.infer<typeof assetConditionSchema>;
        termMonths: number;
        monthlyNetRentCents: number;
        refurbishmentCostCents: number;
        paybackMonths: number;
      };
      comparisons: z.infer<typeof reservationSnapshotSchema>['comparisons'];
    }
  | { kind: 'preview'; preview: ReturnType<typeof describeSecondLifeResult> }
  | { kind: 'none' };

export async function getSecondLifeSection(
  db: PrismaClient,
  input: { assetId: string; today: string; usageSinceLastService?: number }
): Promise<SecondLifeSection> {
  const reservation = await db.secondLifeReservation.findFirst({
    where: { asset_id: input.assetId, status: 'reserved' },
    orderBy: { created_at: 'desc' },
  });

  if (reservation) {
    const snapshot = reservationSnapshotSchema.parse(JSON.parse(reservation.decision_json));
    return {
      kind: 'reserved',
      reservation: {
        id: reservation.id,
        waitingRequestId: reservation.waiting_request_id,
        who: reservation.who,
        reservedBy: reservation.reserved_by,
        reservedAt: reservation.created_at.toISOString(),
        neededBy: reservation.needed_by,
        targetCondition: assetConditionSchema.parse(reservation.target_condition),
        termMonths: reservation.term_months,
        monthlyNetRentCents: reservation.monthly_net_rent_cents,
        refurbishmentCostCents: reservation.refurbishment_cost_cents,
        paybackMonths: reservation.payback_months,
      },
      comparisons: snapshot.comparisons,
    };
  }

  const asset = await db.asset.findUnique({
    where: { id: input.assetId },
    select: { status: true },
  });
  if (asset?.status !== 'returned') return { kind: 'none' };

  const result = await evaluateSecondLife(
    db,
    {
      assetId: input.assetId,
      availableDate: input.today,
      usageSinceLastService: input.usageSinceLastService,
    },
    await activeReservedRequestIds(db)
  );
  return { kind: 'preview', preview: describeSecondLifeResult(result) };
}
