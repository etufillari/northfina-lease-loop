import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { contractResponse } from '@/server/applications';
import { signAndActivateContract } from '@/server/lease-engine/real-contract';
import { demoCustomer } from '@/server/lease-engine/demo-access';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  contractId: z.string().trim().min(1).max(100).optional(),
  signerId: z.string().trim().min(1).max(100),
  actor: z.string().trim().min(1).max(100).optional(),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/applications/[id]/sign'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const activeUser = await demoCustomer(request);
    if (body.signerId !== activeUser.id)
      return fail(403, 'FORBIDDEN', 'Signer must match selected customer');
    const actor = activeUser.id;
    const result = await signAndActivateContract(db, {
      applicationId: id,
      contractId: body.contractId,
      signerId: body.signerId,
      signedAt: new Date(),
      actor,
    });
    if (!result.ok) {
      const errors = {
        application_not_found: [404, 'APPLICATION_NOT_FOUND', 'The application was not found'],
        not_approved: [409, 'APPLICATION_NOT_APPROVED', 'Only approved applications can be signed'],
        signing_authority_required: [
          403,
          'SIGNING_AUTHORITY_REQUIRED',
          'The signer is not authorized',
        ],
        invalid_offer: [422, 'INVALID_OR_EXPIRED_OFFER', 'The offer is invalid or expired'],
        asset_unavailable: [409, 'ASSET_UNAVAILABLE', 'The asset is no longer available'],
        already_signed: [
          409,
          'CONTRACT_ALREADY_SIGNED',
          'The application already has a signed contract',
        ],
      } as const;
      const [status, code, message] = errors[result.reason];
      return fail(status, code, message);
    }
    return ok(contractResponse(result.contract), { status: 201 });
  }
);
