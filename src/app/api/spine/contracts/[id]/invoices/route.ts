import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { checkRequestOrigin, readDemoContext } from '@/server/demo-context';
import { issueInvoices } from '@/server/spine-invoices';
import { emptyInputSchema } from '@/server/spine-shapes';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/spine/contracts/[id]/invoices'>) => {
    checkRequestOrigin(request);
    const { id } = await params;
    const context = await readDemoContext(request);
    await readJsonBody(request, emptyInputSchema);
    return ok(await issueInvoices(db, context, id));
  }
);
