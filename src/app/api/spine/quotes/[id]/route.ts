import { handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { readDemoContext } from '@/server/demo-context';
import { ownedQuote } from '@/server/spine-quotes';
import { quoteView } from '@/server/spine-views';

export const GET = handleRoute(
  async (request, { params }: RouteContext<'/api/spine/quotes/[id]'>) => {
    const { id } = await params;
    return ok(quoteView(await ownedQuote(db, await readDemoContext(request), id)));
  }
);
