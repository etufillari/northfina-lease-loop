// Who may do what. The demo has no passwords: the persona picked in the header is the actor
// every request carries. These checks make the rules hold on the server, whatever page a
// persona opens or URL they paste:
// - a customer acts only on their own applications and contracts;
// - desk work (reviews, the second-life desk, releasing holds, item records) is staff work,
//   and no customer persona can do it.
import type { PrismaClient } from '@/generated/prisma/client';
import { fail } from './api-response';
import type { TransactionClient } from './audit';

type Reader = PrismaClient | TransactionClient;

/** Staff are the actors who are not customers (the "staff" persona, desk ids, jobs). */
export async function isStaffActor(db: Reader, actor: string): Promise<boolean> {
  const customer = await db.customer.findUnique({ where: { id: actor }, select: { id: true } });
  return customer === null;
}

/** For a staff-only route: a 403 envelope when a customer persona calls it, else null. */
export async function staffOnly(db: Reader, actor: string): Promise<Response | null> {
  return (await isStaffActor(db, actor))
    ? null
    : fail(403, 'STAFF_ONLY', 'This is for Northfina staff only');
}

/** The envelope for an action on someone else's application or contract. */
export function notYours(): Response {
  return fail(403, 'NOT_YOURS', 'This belongs to another customer');
}
