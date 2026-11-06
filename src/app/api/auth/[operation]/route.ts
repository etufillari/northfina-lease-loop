import { fail, handleRoute, ok } from '@/server/api-response';
import { handleAuthMutation } from '@/server/auth-handler';
import { authOperations, type AuthOperation } from '@/server/auth-input';
import { requireIdentity } from '@/server/auth-session';
import { db } from '@/server/db';

// Deliberately expose reviewed operations only, not Better Auth's catch-all handler.
export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/auth/[operation]'>) => {
    const { operation } = await params;
    if (!Object.hasOwn(authOperations, operation)) return fail(404, 'NOT_FOUND', 'Not found.');
    return handleAuthMutation(db, request, operation as AuthOperation);
  }
);

export const GET = handleRoute(
  async (request, { params }: RouteContext<'/api/auth/[operation]'>) => {
    const { operation } = await params;
    if (operation !== 'me') return fail(404, 'NOT_FOUND', 'Not found.');
    return ok(await requireIdentity(db, request.headers), {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
);
