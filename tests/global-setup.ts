// Runs once before all tests: builds an empty SQLite database with the real migrations
// (`prisma migrate deploy`) in a temporary folder. Tests copy it, so they never touch dev.db.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    templateDatabasePath: string;
  }
}

export default async function setup(project: TestProject) {
  const dir = await mkdtemp(path.join(tmpdir(), 'lease-loop-test-'));
  const templateDatabasePath = path.join(dir, 'template.db');

  const require = createRequire(import.meta.url);
  const prismaCli = path.join(
    path.dirname(require.resolve('prisma/package.json')),
    'build/index.js'
  );
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    // SQLite migration setup depends on info-level engine output in affected Prisma versions.
    // Scope the upstream workaround to this subprocess, including when a shell sets RUST_LOG=error.
    // https://github.com/prisma/prisma/issues/29355
    env: { ...process.env, DATABASE_URL: `file:${templateDatabasePath}`, RUST_LOG: 'info' },
    stdio: 'pipe',
  });

  project.provide('templateDatabasePath', templateDatabasePath);

  return async () => {
    await rm(dir, { recursive: true, force: true });
  };
}
