import { createHash } from 'node:crypto';
import { ApiError } from './api-response';

/** Stable key order makes {a:1,b:2} and {b:2,a:1} the same JSON request. */
export function requestHash(value: unknown): string {
  function canonical(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(canonical);
    if (item !== null && typeof item === 'object') {
      const object = item as Record<string, unknown>;
      // Code-unit ordering is stable across server locales.
      return Object.fromEntries(
        Object.keys(object)
          .sort()
          .map((key) => [key, canonical(object[key])])
      );
    }
    return item;
  }
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export function requireSameRequest(storedHash: string | null, actualHash: string): void {
  if (storedHash !== actualHash) {
    throw new ApiError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'This request identifier was already used for a different action'
    );
  }
}

/** Unique constraints and transaction conflicts are expected contention, not server internals. */
export function rethrowDatabaseConflict(error: unknown): never {
  if (
    error instanceof Error &&
    'code' in error &&
    ['P2002', 'P2034', 'P2028'].includes(String(error.code))
  ) {
    throw new ApiError(
      409,
      'RETRY_REQUEST',
      'The item changed while this action was running; refresh and retry'
    );
  }
  throw error;
}
