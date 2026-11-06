// Parses a row with its write schema (src/domain/rows, D27) on the server side of a write or a
// read. A row that breaks its schema is a bug in our code, not a bad request: it throws a
// RowRuleError, which `errorToResponse` answers with a generic 500 and logs on the server.
// A ZodError would become a 400 VALIDATION_ERROR that lists internal column names.
import type { z } from 'zod';

export class RowRuleError extends Error {
  constructor(
    readonly table: string,
    readonly issues: readonly z.core.$ZodIssue[]
  ) {
    const where = issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    super(`A ${table} row breaks its write schema: ${where}`);
    this.name = 'RowRuleError';
  }
}

/** The row parsed by `schema`, or a RowRuleError naming `table` and the issues. */
export function parseRow<S extends z.ZodType>(table: string, schema: S, row: unknown): z.output<S> {
  const result = schema.safeParse(row);
  if (!result.success) throw new RowRuleError(table, result.error.issues);
  return result.data;
}

/** A stored `*_json` column parsed through `schema`; text that is not JSON is a RowRuleError too. */
export function parseStoredJson<S extends z.ZodType>(
  column: string,
  schema: S,
  text: string
): z.output<S> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RowRuleError(column, [
      { code: 'custom', path: [], message: 'not JSON', input: text } as z.core.$ZodIssue,
    ]);
  }
  return parseRow(column, schema, value);
}
