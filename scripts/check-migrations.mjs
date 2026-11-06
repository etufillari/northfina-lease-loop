// Fails when prisma/schema.prisma has changes that no migration in prisma/migrations covers.
// CI sets up its database with `prisma migrate deploy`, which applies committed migrations only,
// so a schema edit without a migration shows up as confusing "column does not exist" test
// failures. This check names the real cause instead.
// Usage: node scripts/check-migrations.mjs
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const SCHEMA_PATH = 'prisma/schema.prisma';
export const MIGRATIONS_PATH = 'prisma/migrations';

/** Arguments for `prisma migrate diff`: replay the migrations, compare with the schema. */
export function diffArgs(migrationsPath = MIGRATIONS_PATH, schemaPath = SCHEMA_PATH) {
  return [
    'prisma',
    'migrate',
    'diff',
    '--from-migrations',
    migrationsPath,
    '--to-schema',
    schemaPath,
    '--exit-code',
  ];
}

/**
 * Reads the exit code of `prisma migrate diff --exit-code`: 0 = no difference,
 * 2 = the schema has changes without a migration, anything else = the diff itself failed.
 * @param {number | null} status
 * @returns {'in_sync' | 'missing_migration' | 'error'}
 */
export function interpretDiffStatus(status) {
  if (status === 0) return 'in_sync';
  if (status === 2) return 'missing_migration';
  return 'error';
}

function main() {
  const result = spawnSync('npx', diffArgs(), { encoding: 'utf8' });
  const outcome = interpretDiffStatus(result.status);

  if (outcome === 'in_sync') {
    console.log('✅ Every change in prisma/schema.prisma has a migration.');
    return;
  }
  if (outcome === 'missing_migration') {
    console.error(
      '❌ prisma/schema.prisma has changes that no migration covers.\n' +
        '   Run `npm run db:migrate -- --name <what_changed>` and commit the new folder in\n' +
        '   prisma/migrations/ together with the schema. Never hand-write migration SQL.\n\n' +
        'What the missing migration would change:'
    );
    console.error(result.stdout);
  } else {
    console.error('❌ Could not compare the schema with the migrations:');
    console.error(result.stdout, result.stderr, result.error ?? '');
  }
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
