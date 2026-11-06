import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { checkRequestOrigin, readDemoContext } from '@/server/demo-context';
import { submitApplication } from '@/server/spine-applications';
import { applicationInputSchema } from '@/server/spine-shapes';

export const POST = handleRoute(async (request) => {
  checkRequestOrigin(request);
  const context = await readDemoContext(request);
  return ok(
    await submitApplication(db, context, await readJsonBody(request, applicationInputSchema))
  );
});
