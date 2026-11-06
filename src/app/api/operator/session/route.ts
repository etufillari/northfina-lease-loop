import { requireSameOrigin } from '@/server/request-origin';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import {
  createOperatorSession,
  OPERATOR_COOKIE,
  operatorCookieOptions,
} from '@/server/circular/operator-session';

export const POST = handleRoute(async (request) => {
  requireSameOrigin(request);
  const { password } = await readJsonBody(
    request,
    z.strictObject({ password: z.string().min(1).max(200) })
  );
  const token = createOperatorSession(password);
  (await cookies()).set(OPERATOR_COOKIE, token, operatorCookieOptions());
  return ok({ signedIn: true });
});
export const DELETE = handleRoute(async (request) => {
  requireSameOrigin(request);
  (await cookies()).delete(OPERATOR_COOKIE);
  return ok({ signedIn: false });
});
