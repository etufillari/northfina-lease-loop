import { describe, expect, it } from 'vitest';
import {
  diffArgs,
  interpretDiffStatus,
  MIGRATIONS_PATH,
  SCHEMA_PATH,
} from './check-migrations.mjs';

describe('diffArgs', () => {
  it('replays the migrations and compares them with the schema, signalling via the exit code', () => {
    expect(diffArgs()).toEqual([
      'prisma',
      'migrate',
      'diff',
      '--from-migrations',
      MIGRATIONS_PATH,
      '--to-schema',
      SCHEMA_PATH,
      '--exit-code',
    ]);
  });

  it('accepts other paths', () => {
    expect(diffArgs('tmp/migrations', 'tmp/schema.prisma')).toContain('tmp/migrations');
    expect(diffArgs('tmp/migrations', 'tmp/schema.prisma')).toContain('tmp/schema.prisma');
  });
});

describe('interpretDiffStatus', () => {
  it('treats 0 as in sync', () => {
    expect(interpretDiffStatus(0)).toBe('in_sync');
  });

  it('treats 2 as a schema change without a migration', () => {
    expect(interpretDiffStatus(2)).toBe('missing_migration');
  });

  it.each([1, 127, null])('treats %s as a failed comparison', (status) => {
    expect(interpretDiffStatus(status)).toBe('error');
  });
});
