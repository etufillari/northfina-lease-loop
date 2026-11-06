import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { checkRequestOrigin, readDemoContext } from '@/server/demo-context';
import { signContract } from '@/server/spine-signing';
import { signInputSchema } from '@/server/spine-shapes';

export const POST = handleRoute(async (request) => {
  checkRequestOrigin(request);
  const context = await readDemoContext(request);
  const input = await readJsonBody(request, signInputSchema);
  return ok(await signContract(db, context, input.applicationId));
});
