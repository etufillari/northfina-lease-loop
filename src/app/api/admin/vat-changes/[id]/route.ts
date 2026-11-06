// DELETE /api/admin/vat-changes/:id
// Removes an admin VAT change that hasn't started yet. Staff only; see src/server/vat.ts.
import { appDate } from '@/server/app-date';
import { fail, handleRoute, ok } from '@/server/api-response';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { removeVatChange } from '@/server/vat';

const failures = {
  not_found: [404, 'NOT_FOUND', 'VAT change not found'],
  already_in_force: [409, 'ALREADY_IN_FORCE', 'This VAT change has already started'],
} as const;

export const DELETE = handleRoute(
  async (_request, { params }: RouteContext<'/api/admin/vat-changes/[id]'>) => {
    if ((await currentViewer()).kind !== 'staff') {
      return fail(403, 'STAFF_ONLY', 'Only Lease Loop staff can change VAT');
    }
    const id = Number((await params).id);
    if (!Number.isInteger(id)) return fail(404, 'NOT_FOUND', 'VAT change not found');
    const result = await removeVatChange(
      db,
      { id, actor: 'Lease Loop staff' },
      (await appDate()).today
    );
    if (!result.ok) {
      const [status, code, message] = failures[result.reason];
      return fail(status, code, message);
    }
    return ok({ removed: id });
  }
);
