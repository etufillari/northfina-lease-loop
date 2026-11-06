// POST /api/invoices/pay-all   body: {} or { "contractId": "…" }
// Pays every due invoice of the viewer (or of one of their contracts) in one go. DEMO
// payments: no money moves. See payAllDue in src/server/invoices.ts.
import { z } from 'zod';
import { appDate } from '@/server/app-date';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { getContract } from '@/server/contracts';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { payAllDue } from '@/server/invoices';
import { canSee, viewerCustomerId } from '@/server/viewer';

const bodySchema = z.strictObject({ contractId: z.string().trim().min(1).max(64).optional() });

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const viewer = await currentViewer();
  if (body.contractId) {
    const contract = await getContract(db, body.contractId);
    if (!contract) return fail(404, 'NOT_FOUND', 'Contract not found');
    if (!canSee(viewer, contract.customerId)) {
      return fail(403, 'NOT_YOURS', 'This contract belongs to another customer');
    }
  }
  const actor =
    viewer.kind === 'customer'
      ? viewer.customer.name
      : viewer.kind === 'staff'
        ? 'Lease Loop staff'
        : 'guest';
  const filter = viewer.kind === 'staff' ? null : { customerId: viewerCustomerId(viewer) };
  return ok(
    await payAllDue(db, { contractId: body.contractId, filter, actor }, (await appDate()).today)
  );
});
