// GET  /api/sign/:token   the signing link's state on the request's day
// POST /api/sign/:token   body: { action: "sign" | "decline" }
// D46: the token stands in for the signatory's identification (Suomi.fi in production) and
// the e-mailed invitation: whoever holds it acts as the named signatory, recorded in the
// audit as `signatory:<email>`. The actor cookie plays no part.
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { decideByToken, getSigningLink } from '@/server/signatories';
import { signingFailure } from '@/server/signatory-responses';
import { signByTokenBodySchema, signingTokenParamsSchema } from '@/server/signatory-schemas';

export const GET = handleRoute(async (_request, { params }: RouteContext<'/api/sign/[token]'>) => {
  const { token } = signingTokenParamsSchema.parse(await params);
  const link = await getSigningLink(db, token, await todayForRequest());
  if (!link) return fail(404, 'SIGNING_LINK_NOT_FOUND', 'No signing link with that token');
  const { token: _secret, ...state } = link;
  return ok(state);
});

export const POST = handleRoute(async (request, { params }: RouteContext<'/api/sign/[token]'>) => {
  const { token } = signingTokenParamsSchema.parse(await params);
  const body = await readJsonBody(request, signByTokenBodySchema);
  const today = await todayForRequest();

  const result = await decideByToken(db, { token, action: body.action, today });
  return result.ok ? ok(result.application) : signingFailure(result.reason);
});
