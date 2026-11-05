// Reading back what we stored ourselves. A stored row that doesn't match its schema (edited by
// hand, or written by an older version) is our fault, not the caller's: it must surface as a
// generic 500 through `handleRoute`, never as a 400 VALIDATION_ERROR that blames the request.
// The details go to the server log only (D-038).
import type { z } from 'zod';

/** Which row was bad, for the server log. */
export interface StoredRowRef {
  table: string;
  id: string | number;
}

/** A stored row could not be read. Not an `ApiError` or `ZodError`, so it becomes a 500. */
export class CorruptRowError extends Error {
  constructor(where: StoredRowRef, problem: string) {
    super(`Stored ${where.table} ${where.id} is malformed: ${problem}`);
    this.name = 'CorruptRowError';
  }
}

/** Parses a stored value against its schema, or throws `CorruptRowError`. */
export function parseStoredValue<S extends z.ZodType>(
  schema: S,
  value: unknown,
  where: StoredRowRef
): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.join('.') || '(root)');
    throw new CorruptRowError(where, `invalid at ${paths.join(', ')}`);
  }
  return parsed.data;
}

/** Parses a stored JSON column against its schema, or throws `CorruptRowError`. */
export function parseStoredJson<S extends z.ZodType>(
  schema: S,
  json: string,
  where: StoredRowRef
): z.output<S> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new CorruptRowError(where, 'not valid JSON');
  }
  return parseStoredValue(schema, value, where);
}
