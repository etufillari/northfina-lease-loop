// GET /api/applications/:id/contract-preview
// The contract and invoices signing would create today, for the customer to read first.
// Saves nothing. The dates move if they sign on a later day; `calculated_on` says which day.
import { fail, handleRoute, ok } from '@/server/api-response';
import { requireSigner } from '@/server/auth/actor';
import { previewContract } from '@/server/contract/contracts';
import { db } from '@/server/db';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/applications/[id]/contract-preview'>) => {
    const signer = await requireSigner('contract.sign');
    const { id } = await params;

    const result = await previewContract(db, { applicationId: id, ...signer });
    if (result.ok) return ok(result.preview);

    switch (result.reason) {
      case 'application_not_found':
        return fail(404, 'APPLICATION_NOT_FOUND', `No application with id "${id}"`);
      case 'not_approved':
        return fail(409, 'APPLICATION_NOT_APPROVED', 'This application is not approved');
      case 'already_signed':
        return fail(409, 'ALREADY_SIGNED', 'This application has already been signed');
      case 'asset_not_available':
        return fail(409, 'ASSET_NOT_AVAILABLE', 'This item cannot be leased right now');
    }
  }
);
