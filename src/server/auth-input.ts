import { z } from 'zod';
import { ApiError, readJsonBody } from './api-response';
import type { AuthSettings } from './auth-config';

const name = z.string().trim().min(1).max(100);
const email = z.email().trim().toLowerCase().max(254);
const password = z.string().min(15).max(128);

export const authOperations = {
  register: { path: 'sign-up/email', schema: z.strictObject({ name, email, password }) },
  login: {
    path: 'sign-in/email',
    schema: z.strictObject({ email, password: z.string().min(1).max(128) }),
  },
  logout: { path: 'sign-out', schema: z.strictObject({}) },
  'logout-all': { path: 'revoke-sessions', schema: z.strictObject({}) },
  profile: { path: 'update-user', schema: z.strictObject({ name }) },
  password: {
    path: 'change-password',
    schema: z.strictObject({ currentPassword: z.string().min(1).max(128), newPassword: password }),
  },
} as const;

export type AuthOperation = keyof typeof authOperations;

/** Enforce login-CSRF protection too, before handing anything to the auth library. */
export function assertSameOrigin(request: Request, settings: AuthSettings) {
  if (
    request.headers.get('origin') !== settings.baseURL ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    throw new ApiError(403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
  }
}

export async function readAuthInput(request: Request, operation: AuthOperation) {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
    throw new ApiError(415, 'INVALID_CONTENT_TYPE', 'JSON is required.');
  }
  if (Number(request.headers.get('content-length') ?? 0) > 8192) {
    throw new ApiError(413, 'REQUEST_TOO_LARGE', 'Request is too large.');
  }
  // Count actual bytes too: Content-Length is optional and cannot be trusted.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 8192) {
          await reader.cancel();
          throw new ApiError(413, 'REQUEST_TOO_LARGE', 'Request is too large.');
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const boundedRequest = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: new TextDecoder().decode(bytes),
  });
  const input = await readJsonBody(boundedRequest, authOperations[operation].schema);
  // A password change revokes other sessions; callers cannot disable this.
  return operation === 'password' ? { ...input, revokeOtherSessions: true } : input;
}
