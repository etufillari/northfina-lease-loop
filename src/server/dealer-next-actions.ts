import { dealerNextActions } from '@/domain/dealer-next-actions';
import type { PrismaClient } from './prisma-client';
import { requireOperator, type DemoContext } from './demo-context';
import { answersSchema } from './spine-shapes';
import { assetStatusSchema } from '@/data/schemas';
import { z } from 'zod';

const reasonsSchema = z.object({ reasons: z.array(z.string()) });

/** Dealer-only read model. Private application fields are reduced to a boolean on the server. */
export async function readDealerNextActions(db: PrismaClient, context: DemoContext) {
  requireOperator(context);
  const [assets, applications] = await Promise.all([
    db.asset.findMany({
      include: {
        release: true,
        active_lease: { select: { contract_id: true } },
        contracts: { orderBy: { life_number: 'desc' }, take: 1, select: { closed_on: true } },
      },
    }),
    db.application.findMany({
      where: { decision: 'manual_review', submitted_on: { lte: context.businessDate } },
      select: {
        submitted_on: true,
        answers_json: true,
        reasons_json: true,
        quote: {
          select: {
            id: true,
            asset_id: true,
            customer_id: true,
            priced_on: true,
            valid_through: true,
            start_date: true,
            release_revision: true,
            contract: { select: { id: true } },
          },
        },
      },
    }),
  ]);
  return dealerNextActions({
    onDate: context.businessDate,
    assets: assets.map((asset) => ({
      id: asset.id,
      make: asset.make,
      model: asset.model,
      status: assetStatusSchema.parse(asset.status),
      hasActiveLease: asset.active_lease !== null,
      lastClosedOn: asset.contracts[0]?.closed_on ?? null,
      release: asset.release
        ? {
            revision: asset.release.revision,
            readyOn: asset.release.ready_on,
            netPriceCents: asset.release.net_price_cents,
            reservedForCustomerId: asset.release.reserved_for_customer_id,
          }
        : null,
    })),
    signatures: applications.map((application) => {
      const answers = answersSchema.parse(JSON.parse(application.answers_json));
      const reasons = reasonsSchema.parse(JSON.parse(application.reasons_json));
      return {
        quoteId: application.quote.id,
        assetId: application.quote.asset_id,
        customerId: application.quote.customer_id,
        submittedOn: application.submitted_on,
        pricedOn: application.quote.priced_on,
        validThrough: application.quote.valid_through,
        startDate: application.quote.start_date,
        releaseRevision: application.quote.release_revision,
        awaitingSigner:
          reasons.reasons.includes('signatory_required') &&
          answers.q_can_sign === 'no' &&
          typeof answers.q_signatory_email === 'string' &&
          answers.q_signatory_email.trim().length > 0,
        hasContract: application.quote.contract !== null,
      };
    }),
  });
}
