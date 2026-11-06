// Holds prisma/schema.prisma and the Zod write schemas together. SQLite has no enums or CHECK
// constraints, and this repo writes no migration SQL by hand, so the write schemas in
// src/domain/rows are the only guard on a row (D23, D27). This test reads the schema as text,
// the way the practice repo's schemaConstraints.test.ts held its CHECKs to its columns:
// - every column of a guarded model is a key of its write schema, so a new column needs its rule;
// - every `_cents` column refuses a negative and a fractional amount;
// - every `// a | b | c` comment lists exactly the values of that column's Zod enum.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  assetCategorySchema,
  assetConditionSchema,
  assetStatusSchema,
  customerSchema,
  usageUnitSchema,
} from '@/data/schemas';
import { applicationRowSchema } from '@/domain/rows/application';
import { contractRowSchema } from '@/domain/rows/contract';
import { invoiceRowSchema } from '@/domain/rows/invoice';
import { quoteRowSchema } from '@/domain/rows/quote';
import { returnAssessmentRowSchema } from '@/domain/rows/return-assessment';
import {
  applicationDecisionSchema,
  assetEventKindSchema,
  contractStatusSchema,
  invoiceKindSchema,
  invoiceStatusSchema,
} from '@/domain/statuses';
import {
  applicationRow,
  contractRow,
  invoiceRow,
  quoteRow,
  returnAssessmentRow,
} from './helpers/row-examples';

const SCHEMA = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const SCALAR_TYPE = /^(String|Int|Boolean|DateTime)\??$/;
/** Columns the database fills itself. */
const DATABASE_COLUMNS = new Set(['created_at', 'updated_at']);

type Column = { model: string; name: string; comment: string | null };

/** Every scalar column of every model, with its trailing `//` comment. */
function schemaColumns(): Column[] {
  const columns: Column[] = [];
  let model: string | null = null;
  for (const line of SCHEMA.split(/\r?\n/)) {
    const start = /^model (\w+) \{$/.exec(line);
    if (start) model = start[1] ?? null;
    else if (line === '}') model = null;
    else if (model) {
      const [name, type] = line.trim().split(/\s+/);
      if (!name || !type || name.startsWith('//') || name.startsWith('@@')) continue;
      if (!SCALAR_TYPE.test(type)) continue;
      const comment = /\/\/\s*(.*)$/.exec(line)?.[1] ?? null;
      columns.push({ model, name, comment });
    }
  }
  return columns;
}

const columns = schemaColumns();

/** The models whose rows the app writes, each with its write schema and one valid row. */
const GUARDED: Record<string, { schema: z.ZodObject; example: () => Record<string, unknown> }> = {
  Quote: { schema: quoteRowSchema, example: quoteRow },
  Contract: { schema: contractRowSchema, example: contractRow },
  Invoice: { schema: invoiceRowSchema, example: invoiceRow },
  Application: { schema: applicationRowSchema, example: applicationRow },
  ReturnAssessment: { schema: returnAssessmentRowSchema, example: returnAssessmentRow },
};

/** The Zod enum of every column whose comment lists its values. */
const ENUM_OF: Record<string, z.ZodEnum> = {
  'Customer.type': z.enum(customerSchema.options.map((option) => option.shape.type.value)),
  'Asset.category': assetCategorySchema,
  'Asset.condition': assetConditionSchema,
  'Asset.usage_unit': usageUnitSchema,
  'Asset.status': assetStatusSchema,
  'Application.decision': applicationDecisionSchema,
  'Contract.status': contractStatusSchema,
  'Invoice.kind': invoiceKindSchema,
  'Invoice.status': invoiceStatusSchema,
  'AssetEvent.kind': assetEventKindSchema,
};

/** `active | bought | returned (D22)` → ['active', 'bought', 'returned'], or null. */
function listedValues(comment: string | null): string[] | null {
  if (!comment?.includes(' | ')) return null;
  return comment
    .replace(/\(.*\)\s*$/, '')
    .split('|')
    .map((value) => value.trim());
}

describe('schema.prisma is read', () => {
  it('finds the models and their columns', () => {
    for (const model of Object.keys(GUARDED)) {
      expect(
        columns.some((column) => column.model === model),
        model
      ).toBe(true);
    }
  });
});

describe.each(Object.entries(GUARDED))('%s and its write schema', (model, { schema, example }) => {
  const own = columns.filter((c) => c.model === model && !DATABASE_COLUMNS.has(c.name));

  it('has every column of the model, and no other key', () => {
    expect(Object.keys(schema.shape).sort()).toEqual(own.map((c) => c.name).sort());
  });

  it('accepts its example row', () => {
    expect(schema.safeParse(example()).success).toBe(true);
  });

  it.each(own.filter((c) => c.name.endsWith('_cents')).map((c) => [c.name]))(
    '%s refuses negative and fractional cents',
    (name) => {
      expect(schema.safeParse({ ...example(), [name]: -1 }).success).toBe(false);
      expect(schema.safeParse({ ...example(), [name]: 0.5 }).success).toBe(false);
    }
  );
});

describe('every column comment that lists values matches its Zod enum', () => {
  const listed = columns.filter((c) => listedValues(c.comment) !== null);

  it('finds the listed columns', () => {
    expect(listed.map((c) => `${c.model}.${c.name}`).sort()).toEqual(Object.keys(ENUM_OF).sort());
  });

  it.each(listed.map((c) => [`${c.model}.${c.name}`, c] as const))('%s', (key, column) => {
    expect(listedValues(column.comment), `update the comment on ${key} or its enum`).toEqual(
      ENUM_OF[key]?.options
    );
  });
});
