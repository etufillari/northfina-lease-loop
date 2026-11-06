// POST /api/fleets/:id/sign   body: { "signerName": "…" }
// Signs every contract of an approved fleet at once; see src/server/fleets.ts.
import { z } from 'zod';
import { checkPersonName } from '@/domain/names';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { appDate } from '@/server/app-date';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { getFleet, signFleet } from '@/server/fleets';
import { canSee } from '@/server/viewer';

const bodySchema = z.strictObject({
  /** Typing your full name is the signature. */
  signerName: z
    .string()
    .trim()
    .refine((name) => checkPersonName(name) === null, 'Type your full name to sign'),
});

const failures = {
  fleet_not_found: [404, 'NOT_FOUND', 'Fleet not found'],
  application_not_found: [404, 'NOT_FOUND', 'Application not found'],
  later_history: [
    409,
    'LATER_HISTORY',
    'An item has later history: travel forward to its present to change it',
  ],
  already_signed: [409, 'ALREADY_SIGNED', 'This fleet has already been signed'],
  not_approved: [409, 'NOT_APPROVED', 'This fleet cannot be signed online'],
  quote_expired: [409, 'QUOTE_EXPIRED', 'The quote has expired; please apply again'],
  signed_before_quote: [409, 'QUOTE_IN_FUTURE', 'The quote date is after today'],
  part_of_fleet: [409, 'PART_OF_FLEET', 'Sign the whole fleet together'],
  asset_not_available: [409, 'ASSET_NOT_AVAILABLE', 'An item has already been leased'],
} as const;

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/fleets/[id]/sign'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const fleet = await getFleet(db, id);
    if (fleet && !canSee(await currentViewer(), fleet.customerId)) {
      return fail(403, 'NOT_YOURS', 'This fleet belongs to another customer');
    }
    const result = await signFleet(
      db,
      { fleetId: id, signerName: body.signerName },
      (await appDate()).today
    );
    if (!result.ok) {
      const [status, code, message] = failures[result.reason];
      return fail(status, code, message, result.assetId ? { assetId: result.assetId } : undefined);
    }
    return ok(result, { status: 201 });
  }
);
