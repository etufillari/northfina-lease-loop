// Roles and permissions for the no-password "acting as" login. Identity itself is
// simulated (there is no password check), but once someone is acting as a given
// customer or staff member, what their role may do is real and checked here.
//
// Pure: this file never loads data or reads a session. Callers pass in the customers
// and staff they already have, and `src/server/session.ts` decides who is acting now.
import type { Customer, Staff, StaffRole } from '@/data/schemas';

/** Every customer acts as a client. Staff carry their own role from data/staff.json. */
export const CLIENT_ROLE = 'client' as const;
export type Role = typeof CLIENT_ROLE | StaffRole;
export const ROLES: readonly Role[] = [CLIENT_ROLE, 'dealer', 'admin'];

/** True when `value` is one of the known roles. Used to check a role read from outside
 *  the app, e.g. a decoded session token, before it is trusted as a `Role`. */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** One person who can log in, with the role that decides what they may do. */
export type Identity =
  | { kind: 'customer'; role: typeof CLIENT_ROLE; customer: Customer }
  | { kind: 'staff'; role: StaffRole; staff: Staff };

export function identityId(identity: Identity): string {
  return identity.kind === 'customer' ? identity.customer.id : identity.staff.id;
}

export function identityName(identity: Identity): string {
  return identity.kind === 'customer' ? identity.customer.name : identity.staff.name;
}

/** Every customer and every staff member, as one list of identities. */
export function listIdentities(
  customers: readonly Customer[],
  staff: readonly Staff[]
): Identity[] {
  return [
    ...customers.map((customer): Identity => ({ kind: 'customer', role: CLIENT_ROLE, customer })),
    ...staff.map((person): Identity => ({ kind: 'staff', role: person.role, staff: person })),
  ];
}

/** The one identity with this id, across customers and staff; `undefined` if none matches. */
export function findIdentity(
  customers: readonly Customer[],
  staff: readonly Staff[],
  id: string
): Identity | undefined {
  return listIdentities(customers, staff).find((identity) => identityId(identity) === id);
}

/** A plain, serializable view of an identity: enough for an "acting as" UI, no more. */
export type IdentitySummary = { id: string; name: string; role: Role; kind: Identity['kind'] };

export function identitySummary(identity: Identity): IdentitySummary {
  return {
    id: identityId(identity),
    name: identityName(identity),
    role: identity.role,
    kind: identity.kind,
  };
}

// ---------------------------------------------------------------------------
// Permissions: can a role ever do this, not "may this person do this to this record".
// A record-specific check (e.g. "only the client who owns this contract") belongs in
// the service that holds the record, alongside the data it needs to decide.
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  /** Submit a lease application and answer its questions. */
  'application.submit',
  /** Sign a contract as the customer on it. */
  'contract.sign',
  /** See a contract and its invoices when they belong to you. */
  'contract.view_own',
  /** See every contract, not only your own. */
  'contract.view_all',
  /** End a contract at the end of its term: buy out, return or pass on. */
  'contract.end_term',
  /** Change an asset's status, e.g. available → reserved → returned. */
  'asset.change_status',
  /** View the full history (passport) of an item across all its lives. */
  'item.view_history',
  /** Refurbish a returned asset and re-list it for a second life. */
  'second_life.refurbish',
  /** Approve or reject an application sent to manual review. */
  'application.decide_manual_review',
  /** Read the audit log. */
  'audit_log.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** What a dealer may do. Admin is defined as "a dealer, plus more" below, so a new
 *  dealer permission never has to be added to admin by hand. */
const DEALER_PERMISSIONS: readonly Permission[] = [
  'contract.view_all',
  'contract.end_term',
  'asset.change_status',
  'item.view_history',
  'second_life.refurbish',
  'audit_log.view',
];

const GRANTS: Record<Role, readonly Permission[]> = {
  client: ['application.submit', 'contract.sign', 'contract.view_own', 'contract.end_term'],
  dealer: DEALER_PERMISSIONS,
  admin: [...DEALER_PERMISSIONS, 'application.decide_manual_review'],
};

/** Whether `role` may ever perform `permission`. */
export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}
