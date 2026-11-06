// POST /api/admin/vat-changes   body: { "validFrom": "2027-07-01", "ratePercent": 27 }
// Adds a VAT rate from a future date (admin page). Like the rest of this demo there's no login.
// See src/server/vat.ts.
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { appDate } from '@/server/app-date';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { addVatChange } from '@/server/vat';

const bodySchema = z.strictObject({
  validFrom: isoDateSchema,
  ratePercent: z.number().min(0).max(100),
});

const failures = {
  not_in_future: [409, 'NOT_IN_FUTURE', 'A VAT change must start after the app’s date'],
  invalid_rate: [422, 'INVALID_RATE', 'The rate must be 0–100 % with at most two decimals'],
} as const;

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const result = await addVatChange(db, { ...body, actor: 'admin' }, (await appDate()).today);
  if (!result.ok) {
    const [status, code, message] = failures[result.reason];
    return fail(status, code, message);
  }
  return ok(result.change, { status: 201 });
});
