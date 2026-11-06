// POST   /api/assets/:id/reserve   reserves asset or extends active reservation
// DELETE /api/assets/:id/reserve   releases active reservation
// GET    /api/assets/:id/reserve   checks active reservation status
import { z } from 'zod';
import { formatRemainingTime, remainingReservationSeconds } from '@/domain/reservation';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import {
  expireReservation,
  getActiveReservation,
  releaseReservation,
  reserveAsset,
} from '@/server/reservations';

const postBodySchema = z.strictObject({
  actor: z.string().trim().min(1).max(100).default('customer'),
  token: z.string().trim().min(1).max(100).optional(),
  timeoutMinutes: z.number().int().min(1).max(120).optional(),
});

const deleteBodySchema = z.strictObject({
  token: z.string().trim().min(1).max(100),
  actor: z.string().trim().min(1).max(100).default('customer'),
  reason: z
    .enum(['rejected', 'abandoned', 'cancelled', 'timeout', 'completed'])
    .default('cancelled'),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/reserve'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, postBodySchema);

    const result = await reserveAsset(db, {
      assetId: id,
      actor: body.actor,
      token: body.token,
      timeoutMinutes: body.timeoutMinutes,
    });

    if (!result.ok) {
      if (result.reason === 'not_found') {
        return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);
      }
      if (result.reason === 'already_reserved') {
        return fail(
          409,
          'ASSET_RESERVED',
          'This asset is currently reserved by another applicant',
          { assetId: id, existingReservation: result.existingReservation }
        );
      }
      return fail(409, 'ASSET_NOT_AVAILABLE', 'This asset is not available for leasing', {
        assetId: id,
      });
    }

    return ok({
      reservation: result.reservation,
      renewed: result.renewed,
    });
  }
);

export const DELETE = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/reserve'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, deleteBodySchema);

    const result = await releaseReservation(db, {
      assetId: id,
      token: body.token,
      actor: body.actor,
      reason: body.reason,
    });

    if (!result.ok) {
      if (result.reason === 'not_found') {
        return fail(404, 'RESERVATION_NOT_FOUND', `No active reservation for asset "${id}"`);
      }
      return fail(
        403,
        'RESERVATION_FORBIDDEN',
        'Provided reservation token does not match active reservation'
      );
    }

    return ok({ released: true, assetId: id });
  }
);

export const GET = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/reserve'>) => {
    const { id } = await params;
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    const active = await getActiveReservation(db, id);
    if (!active) {
      return ok({ active: false, reservation: null });
    }

    const nowIso = new Date().toISOString();
    const remainingSeconds = remainingReservationSeconds(active.expiresAt, nowIso);
    if (remainingSeconds <= 0) {
      await expireReservation(db, { assetId: id });
      return ok({ active: false, reservation: null });
    }

    const isHolder = Boolean(token && active.token === token);

    return ok({
      active: true,
      reservation: {
        id: active.id,
        assetId: active.assetId,
        expiresAt: active.expiresAt,
        remainingSeconds,
        formattedRemaining: formatRemainingTime(remainingSeconds),
        isHolder,
      },
    });
  }
);
