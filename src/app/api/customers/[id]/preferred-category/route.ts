// PUT /api/customers/:id/preferred-category  body: { category }
// Remembers the catalogue category the customer browses, so the catalogue opens on it
// next time they pick their persona — even years later, unlike a cookie.
import { z } from 'zod';
import { assetCategorySchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { getCustomer, savePreferredCategory } from '@/server/customers';
import { notYours } from '@/server/authz';
import { db } from '@/server/db';
import { requireCustomer } from '@/server/current-user';

const bodySchema = z.strictObject({
  category: assetCategorySchema,
});

export const PUT = handleRoute(
  async (request, { params }: RouteContext<'/api/customers/[id]/preferred-category'>) => {
    const { id } = await params;
    const user = await requireCustomer();
    if (user instanceof Response) return user;
    const body = await readJsonBody(request, bodySchema);
    if (user.customerId !== id) return notYours();
    const customer = await getCustomer(db, id);
    if (!customer) return fail(404, 'CUSTOMER_NOT_FOUND', `No customer with id "${id}"`);
    await savePreferredCategory(db, {
      customerId: id,
      category: body.category,
      actor: user.actorId,
    });
    return ok({ category: body.category });
  }
);
