// POST /api/admin/signatures/:id/decline   body: { "note": "…" | null }
// Card 6: the company's signatory declines a request that was waiting for them; the applicant
// sees who declined, when and the note. Admin page; like the rest of this demo there is no
// login. See src/server/signatures.ts.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { appDate } from '@/server/app-date';
import { db } from '@/server/db';
import { declineAsSignatory } from '@/server/signatures';

const bodySchema = z.strictObject({
  note: z.string().trim().max(500).nullable(),
});

const failures = {
  application_not_found: [404, 'NOT_FOUND', 'Signature request not found'],
  fleet_not_found: [404, 'NOT_FOUND', 'Signature request not found'],
  not_waiting: [409, 'NOT_WAITING', 'This request is not waiting for a signature'],
  later_history: [
    409,
    'LATER_HISTORY',
    'This request has later history: travel forward to its present to change it',
  ],
  already_signed: [409, 'ALREADY_SIGNED', 'This has already been signed'],
  not_approved: [409, 'NOT_APPROVED', 'This cannot be signed online'],
  quote_expired: [409, 'QUOTE_EXPIRED', 'The quote has expired'],
  signed_before_quote: [409, 'QUOTE_IN_FUTURE', 'The quote date is after today'],
  part_of_fleet: [409, 'PART_OF_FLEET', 'Decline the whole fleet together'],
  // Never for the signatory, whose name isn't compared (see signingCheck); here for completeness.
  name_mismatch: [422, 'NAME_MISMATCH', 'Sign with the full name given in the application'],
  asset_not_available: [409, 'ASSET_NOT_AVAILABLE', 'An item has already been leased'],
  declined: [409, 'DECLINED', 'This has already been declined'],
} as const;

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/admin/signatures/[id]/decline'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await declineAsSignatory(db, { id, note: body.note }, (await appDate()).today);
    if (!result.ok) {
      const [status, code, message] = failures[result.reason];
      return fail(status, code, message);
    }
    return ok(result);
  }
);
