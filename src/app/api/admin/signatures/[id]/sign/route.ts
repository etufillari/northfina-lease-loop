// POST /api/admin/signatures/:id/sign   body: { "signerName": "…" }
// Card 6: the company's signatory signs a request that was waiting for them (an application
// or a whole fleet), acting as the person it was sent to. The contracts go on the applicant's
// account. Admin page; like the rest of this demo there is no login. See
// src/server/signatures.ts.
import { z } from 'zod';
import { checkPersonName } from '@/domain/names';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { appDate } from '@/server/app-date';
import { db } from '@/server/db';
import { signAsSignatory } from '@/server/signatures';

const bodySchema = z.strictObject({
  /** Typing your full name is the signature. */
  signerName: z
    .string()
    .trim()
    .refine((name) => checkPersonName(name) === null, 'Type your full name to sign'),
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
  quote_expired: [409, 'QUOTE_EXPIRED', 'The quote has expired; the company must apply again'],
  signed_before_quote: [409, 'QUOTE_IN_FUTURE', 'The quote date is after today'],
  part_of_fleet: [409, 'PART_OF_FLEET', 'Sign the whole fleet together'],
  asset_not_available: [409, 'ASSET_NOT_AVAILABLE', 'An item has already been leased'],
  declined: [409, 'DECLINED', 'The signatory declined to sign this'],
} as const;

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/admin/signatures/[id]/sign'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await signAsSignatory(
      db,
      { id, signerName: body.signerName },
      (await appDate()).today
    );
    if (!result.ok) {
      const [status, code, message] = failures[result.reason];
      return fail(status, code, message, result.assetId ? { assetId: result.assetId } : undefined);
    }
    return ok(result, { status: 201 });
  }
);
