import type { PrismaClient } from '@/generated/prisma/client';
import { ApiError } from './api-response';
import type { TransactionClient } from './audit';
import { createAuth, type AuthSettings } from './auth-config';

export type AccountIdentity = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string;
  customerId: string;
};

/** Authoritative database read; no cookie cache, session refresh or expired-row deletion. */
export async function readIdentity(
  database: PrismaClient | TransactionClient,
  headers: Headers,
  settings?: AuthSettings
): Promise<AccountIdentity | null> {
  const session = await createAuth(database, settings).api.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) return null;
  const customer = await database.customer.findUnique({
    where: { ownerUserId: session.user.id },
    select: { id: true },
  });
  if (!customer) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    role: session.user.role,
    customerId: customer.id,
  };
}

export async function requireIdentity(
  database: PrismaClient | TransactionClient,
  headers: Headers,
  settings?: AuthSettings
): Promise<AccountIdentity> {
  const identity = await readIdentity(database, headers, settings);
  if (!identity) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in.');
  return identity;
}

export async function requireStaff(
  database: PrismaClient | TransactionClient,
  headers: Headers,
  settings?: AuthSettings
): Promise<AccountIdentity> {
  const identity = await requireIdentity(database, headers, settings);
  if (identity.role !== 'staff') throw new ApiError(403, 'FORBIDDEN', 'Access denied.');
  return identity;
}
