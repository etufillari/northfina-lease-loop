import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { checkRequestOrigin, readDemoContext } from '@/server/demo-context';
import { createQuote } from '@/server/spine-quotes';
import { quoteInputSchema } from '@/server/spine-shapes';

export const POST = handleRoute(async (request) => {
  checkRequestOrigin(request);
  const context = await readDemoContext(request);
  return ok(await createQuote(db, context, await readJsonBody(request, quoteInputSchema)));
});
