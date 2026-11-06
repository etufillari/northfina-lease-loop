// POST /api/applications/:id/withdraw   (no body)
// D87: the applicant (or the admin for them) withdraws an application that is not a lease yet.
// Authorized first (D73); 404 for an unknown id or another customer's, 409
// APPLICATION_NOT_WITHDRAWABLE with `{ code, params }` when it is signed or already final.
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { withdrawApplication } from '@/server/applications';
import { authorize, forbiddenResponse, refusalResponse } from '@/server/authorize';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { applicationIdParamsSchema } from '@/server/routes';

const notFound = () => fail(404, 'APPLICATION_NOT_FOUND', 'No application with that id');

export const POST = handleRoute(
  async (_request, { params }: RouteContext<'/api/applications/[id]/withdraw'>) => {
    const { id } = applicationIdParamsSchema.parse(await params);
    const actor = await readActor(db);
    const auth = await authorize(db, actor, 'withdraw_application', { application: id });
    if (!auth.ok) return refusalResponse(auth.reason, notFound);
    const today = await todayForRequest();

    const result = await withdrawApplication(db, { id, actor, today });
    if (result.ok) return ok(result.application);
    if (result.reason === 'forbidden') return forbiddenResponse(result.refusal);
    if (result.reason === 'not_found') return notFound();
    return fail(
      409,
      'APPLICATION_NOT_WITHDRAWABLE',
      'The application is signed or already final',
      result.refusal
    );
  }
);
