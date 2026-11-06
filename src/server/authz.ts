// Shared answers for "you may not do this". WHO is asking comes from the signed-in user
// (src/server/current-user.ts), never from the request body; the server functions decide
// ownership (a customer acts only on their own applications and contracts) and the routes
// require staff for desk work.
import { fail } from './api-response';

/** The envelope for an action on someone else's application or contract. */
export function notYours(): Response {
  return fail(403, 'NOT_YOURS', 'This belongs to another customer');
}
