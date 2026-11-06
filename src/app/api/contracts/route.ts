// POST /api/contracts   body: { "applicationId": "…", "signerName": "Aino Virtanen" }
// Signs the contract for an approved application and locks its price; see
// src/server/contracts.ts.
import { z } from 'zod';
import { checkPersonName } from '@/domain/names';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { getApplication } from '@/server/applications';
import { signContract } from '@/server/contracts';
import { currentViewer } from '@/server/current-viewer';
import { canSee } from '@/server/viewer';
import { db } from '@/server/db';
import { appDate } from '@/server/app-date';

const signSchema = z.strictObject({
  applicationId: z.string().trim().min(1).max(64),
  /** Typing your full name is the signature. */
  signerName: z
    .string()
    .trim()
    .refine((name) => checkPersonName(name) === null, 'Type your full name to sign'),
});

const failures = {
  later_history: [
    409,
    'LATER_HISTORY',
    'This item has later history: travel forward to its present to change it',
  ],
  application_not_found: [404, 'NOT_FOUND', 'Application not found'],
  already_signed: [409, 'ALREADY_SIGNED', 'This application has already been signed'],
  not_approved: [409, 'NOT_APPROVED', 'This application cannot be signed online'],
  quote_expired: [409, 'QUOTE_EXPIRED', 'The quote has expired; please apply again'],
  signed_before_quote: [409, 'QUOTE_IN_FUTURE', 'The quote date is after today'],
  part_of_fleet: [409, 'PART_OF_FLEET', 'Sign the whole fleet together'],
  name_mismatch: [422, 'NAME_MISMATCH', 'Sign with the full name given in the application'],
  asset_not_available: [409, 'ASSET_NOT_AVAILABLE', 'This item has already been leased'],
  declined: [409, 'DECLINED', 'The company’s signatory declined to sign this'],
} as const;

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, signSchema);
  // Only the customer who applied (or staff) may sign; see viewer.ts.
  const application = await getApplication(db, body.applicationId);
  if (application && !canSee(await currentViewer(), application.customerId)) {
    return fail(403, 'NOT_YOURS', 'This application belongs to another customer');
  }
  const result = await signContract(db, body, (await appDate()).today);
  if (!result.ok) {
    const [status, code, message] = failures[result.reason];
    return fail(
      status,
      code,
      message,
      result.contractId ? { contractId: result.contractId } : undefined
    );
  }
  return ok(result.contract, { status: 201 });
});
