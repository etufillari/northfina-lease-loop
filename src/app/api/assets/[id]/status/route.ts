// PATCH /api/assets/:id/status   body: { "status": "reserved", "actor": "team-kettu" }
// Changes the status and writes an audit row in the same transaction.
// There is no login in the starter, so `actor` is whatever the caller says.
import { z } from 'zod';
import { assetStatusSchema, centsSchema, isoDateSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { changeAssetStatus } from '@/server/assets';
import { signContract } from '@/server/contracts';
import { completeReservation } from '@/server/reservations';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  status: assetStatusSchema,
  actor: z.string().trim().min(1).max(100),
  token: z.string().trim().optional(),
  termMonths: z.number().int().positive().optional(),
  downPaymentCents: centsSchema.optional(),
  signedOn: isoDateSchema.optional(),
  answers: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export const PATCH = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/status'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);

    if (body.status === 'leased' && body.termMonths !== undefined) {
      const signed = await signContract(db, {
        assetId: id,
        actor: body.actor,
        termMonths: body.termMonths,
        downPaymentCents: body.downPaymentCents ?? 0,
        signedOn: body.signedOn,
        token: body.token,
        answers: body.answers,
      });

      if (!signed.ok) {
        if (signed.reason === 'not_found') {
          return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);
        }
        if (signed.reason === 'reservation_conflict') {
          return fail(
            409,
            'RESERVATION_CONFLICT',
            'This asset is currently reserved by another applicant or the reservation expired'
          );
        }
        if (signed.reason === 'asset_not_available') {
          return fail(409, 'ASSET_NOT_AVAILABLE', 'This asset is not available for leasing');
        }
        return fail(422, 'INVALID_CONTRACT', 'Contract terms cannot be priced');
      }

      return ok({
        ...signed.asset,
        contractId: signed.contractId,
        quoteId: signed.quoteId,
        applicationId: signed.applicationId,
      });
    }

    const activeReservation = await db.assetReservation.findFirst({
      where: { asset_id: id, status: 'active' },
    });
    if (activeReservation) {
      if (!body.token || activeReservation.token !== body.token) {
        return fail(
          409,
          'RESERVATION_CONFLICT',
          'This asset is currently reserved by another applicant'
        );
      }
    }

    if (body.token) {
      const completed = await completeReservation(db, {
        assetId: id,
        token: body.token,
        actor: body.actor,
      });
      if (!completed.ok) {
        return fail(
          409,
          'RESERVATION_CONFLICT',
          'Reservation is no longer active or token does not match'
        );
      }
    }

    const result = await changeAssetStatus(db, { id, status: body.status, actor: body.actor });
    if (!result.ok) return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);
    return ok(result.asset);
  }
);
