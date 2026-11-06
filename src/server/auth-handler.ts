import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import { ApiError, fail, ok } from './api-response';
import { withAudit, type AuditEntry } from './audit';
import { authSettings, createAuth, type AuthSettings } from './auth-config';
import { assertSameOrigin, authOperations, readAuthInput, type AuthOperation } from './auth-input';
import { readIdentity, requireIdentity } from './auth-session';

const privateOperations = new Set<AuthOperation>(['logout-all', 'profile', 'password']);

/** No raw library response bodies: they may contain bearer session tokens. */
export async function handleAuthMutation(
  database: PrismaClient,
  request: Request,
  operation: AuthOperation,
  settings: AuthSettings = authSettings()
): Promise<Response> {
  assertSameOrigin(request, settings);
  const input = await readAuthInput(request, operation);
  const entry: AuditEntry = {
    actor: 'anonymous',
    action: `auth.${operation}`,
    entityType: 'user',
    entityId: 'anonymous',
  };

  return withAudit(database, entry, async (tx) => {
    const identity = privateOperations.has(operation)
      ? await requireIdentity(tx, request.headers, settings)
      : await readIdentity(tx, request.headers, settings);
    if (identity) entry.actor = entry.entityId = identity.id;
    const auth = createAuth(tx, settings);
    const invoke = (path: string, body: unknown) =>
      auth.handler(
        new Request(`${settings.baseURL}/api/auth/${path}`, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify(body),
        })
      );
    let result = await invoke(authOperations[operation].path, input);
    // Unexpected failures roll back both library writes and the audit row.
    if (result.status >= 500) throw new ApiError(500, 'AUTH_UNAVAILABLE', 'Authentication failed.');
    entry.details = { outcome: result.ok ? 'success' : 'denied' };

    if (!result.ok) {
      // Keep denied-request rate-limit writes inside this audited transaction.
      const limited = result.status === 429;
      const response = fail(
        limited ? 429 : operation === 'login' ? 401 : 400,
        limited ? 'RATE_LIMITED' : operation === 'login' ? 'INVALID_CREDENTIALS' : 'AUTH_FAILED',
        limited ? 'Please try again later.' : 'The request could not be completed.'
      );
      const retry = result.headers.get('x-retry-after');
      if (retry) response.headers.set('Retry-After', retry);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    // The library created this user and credentials in this same transaction.
    if (operation === 'register') {
      const data: { user: { id: string } } = await result.json();
      entry.actor = entry.entityId = data.user.id;
      await tx.customer.create({ data: { id: randomUUID(), ownerUserId: data.user.id } });
    } else if (operation === 'login') {
      const data: { user: { id: string } } = await result.json();
      entry.actor = entry.entityId = data.user.id;
    } else if (operation === 'logout-all') {
      // Revoke all records, and also expire this browser's signed cookie.
      result = await invoke('sign-out', {});
      if (!result.ok) throw new ApiError(500, 'AUTH_UNAVAILABLE', 'Authentication failed.');
    }

    const response = ok({ completed: true });
    response.headers.set('Cache-Control', 'no-store');
    for (const cookie of result.headers.getSetCookie())
      response.headers.append('Set-Cookie', cookie);
    return response;
  });
}
