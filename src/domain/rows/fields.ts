// The field rules every write schema in this folder is built from. SQLite stores these
// columns as plain TEXT and INTEGER with no CHECK, so these schemas are the only guard on a
// row (D23, D27): the server function that writes a row parses it with its schema first.
import { z } from 'zod';
import { assetConditionSchema, type AssetCondition } from '@/data/schemas';

export { centsSchema, isoDateSchema } from '@/data/schemas';

/** 100 % in basis points. A rate above it is a percent written as basis points twice. */
export const VAT_RATE_BP_MAX = 10_000;

/** A row id, ours or the data pack's (`ebike-003`, a uuid). */
export const idSchema = z.string().min(1);

/** Units on one contract: at least one (D8). */
export const quantitySchema = z.number().int().positive();

/** A lease term in whole months. Which terms exist is the coefficient table's to say. */
export const termMonthsSchema = z.number().int().positive();

/** The monthly rent factor in integer millionths: 0.027584 is 27584 (team rule 5). */
export const factorMillionthsSchema = z.number().int().positive();

/** A VAT rate in basis points: 2550 is 25.5 %. */
export const vatRateBpSchema = z.number().int().min(0).max(VAT_RATE_BP_MAX);

export const priceListVersionSchema = z.number().int().positive();

/** A coefficient band's letter. Which bands exist is the coefficient table's to say. */
export const bandSchema = z.string().regex(/^[A-Z]$/, 'a band is one capital letter');

/** An outcome the page writes in the visitor's language (team rule 6): a code, never a sentence. */
export const outcomeSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9_]*$/, 'an outcome code is snake_case'),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type Outcome = z.infer<typeof outcomeSchema>;

/**
 * Pass to a row's `superRefine` / `refine`: its cross-field rules run only once every field is
 * valid. Zod 4 would otherwise run them after a field failed a check such as `nonnegative()`,
 * and the money and day helpers they call throw on such input.
 */
export const ON_VALID_FIELDS = {
  when: (payload: { issues: readonly unknown[] }) => payload.issues.length === 0,
};

function parsesAs(schema: z.ZodType, text: string): boolean {
  try {
    return schema.safeParse(JSON.parse(text)).success;
  } catch {
    return false;
  }
}

/** A `*_json` text column: JSON text whose value matches `schema`. */
export function jsonText(schema: z.ZodType) {
  return z.string().refine((text) => parsesAs(schema, text), {
    message: 'not JSON of the expected shape',
  });
}

/** True when `condition` is `atLeast` or better. The data pack lists them best first. */
export function conditionAtLeastAsGood(
  condition: AssetCondition,
  atLeast: AssetCondition
): boolean {
  const rank = assetConditionSchema.options;
  return rank.indexOf(condition) <= rank.indexOf(atLeast);
}
