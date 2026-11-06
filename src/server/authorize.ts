// Authorization before the action (D73, D74). `authorize` reads only whose record it is (an id
// and a customer id, through the owning slice's read function), applies the pure policy
// (src/domain/authz/policy.ts) and answers the refusal or the owner. Routes call it first;
// the services call it again at their top, so a direct call without the route is refused too.
import {
  ANONYMOUS,
  can,
  type AuthzAction,
  type AuthzRefusal,
  type AuthzSubject,
} from '@/domain/authz/policy';
import { fail } from './api-response';
import { applicationOwner } from './applications';
import type { TransactionClient } from './audit';
import { contractCustomerId } from './contracts';
import { getCustomer } from './customers';
import { invoiceCustomerId } from './invoices';
import type { PrismaClient } from './prisma-client';

/** What the action is on: a record by id, or nothing that belongs to a customer. */
export type SubjectRef =
  | { application: string }
  | { contract: string }
  | { invoice: string }
  | { customer: string }
  | { none: true };

export type NotFound = { code: 'not_found'; params: Record<string, never> };
export type Authorization =
  { ok: true; ownerId: string | null } | { ok: false; reason: AuthzRefusal | NotFound };

type Db = PrismaClient | TransactionClient;

async function resolveSubject(db: Db, ref: SubjectRef): Promise<AuthzSubject | null> {
  if ('application' in ref) return applicationOwner(db, ref.application);
  if ('contract' in ref) {
    const customerId = await contractCustomerId(db, ref.contract);
    return customerId === null ? null : { customerId };
  }
  if ('invoice' in ref) {
    const customerId = await invoiceCustomerId(db, ref.invoice);
    return customerId === null ? null : { customerId };
  }
  if ('customer' in ref) {
    return (await getCustomer(db, ref.customer)) ? { customerId: ref.customer } : null;
  }
  return { customerId: null };
}

/**
 * Whether `actor` may take `action` on the subject. Anonymous is refused before anything is
 * read, so the answer never tells whether a record exists; an unknown record is `not_found`
 * for the caller's own 404.
 */
export async function authorize(
  db: Db,
  actor: string,
  action: AuthzAction,
  ref: SubjectRef
): Promise<Authorization> {
  if (actor === ANONYMOUS && action !== 'run_demo_card') {
    const refused = can(actor, action, { customerId: null });
    if (!refused.ok) return refused;
  }
  const subject = await resolveSubject(db, ref);
  if (!subject) return { ok: false, reason: { code: 'not_found', params: {} } };
  const decision = can(actor, action, subject);
  return decision.ok ? { ok: true, ownerId: subject.customerId } : decision;
}

/** D74: `not_signed_in` is 401, every other refusal 403; the code is always `FORBIDDEN`. */
export function forbiddenResponse(reason: AuthzRefusal): Response {
  return reason.code === 'not_signed_in'
    ? fail(401, 'FORBIDDEN', 'Sign in (continue as) first', reason)
    : fail(403, 'FORBIDDEN', 'You may not do this', reason);
}

/** The route's answer to a refused authorization: its own 404, or `forbiddenResponse`. */
export function refusalResponse(
  reason: AuthzRefusal | NotFound,
  notFound: () => Response
): Response {
  return reason.code === 'not_found' ? notFound() : forbiddenResponse(reason);
}
