import { ApiError, handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { readDemoContext, requireCustomer } from '@/server/demo-context';
import { applicationView } from '@/server/spine-views';

export const GET = handleRoute(
  async (request, { params }: RouteContext<'/api/spine/applications/[id]'>) => {
    const { id } = await params;
    const context = await readDemoContext(request);
    requireCustomer(context);
    const application = await db.application.findFirst({
      where: { id, customer_id: context.customer.id },
    });
    if (!application)
      throw new ApiError(404, 'APPLICATION_NOT_FOUND', 'The application was not found');
    return ok(applicationView(application));
  }
);
