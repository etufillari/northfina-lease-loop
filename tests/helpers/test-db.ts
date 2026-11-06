// A fresh, migrated SQLite database for one test file. Call `cleanup()` in afterAll.
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inject } from 'vitest';
import { createPrismaClient } from '@/server/prisma-client';

export async function createTestDb() {
  const dir = await mkdtemp(path.join(tmpdir(), 'lease-loop-db-'));
  const file = path.join(dir, 'test.db');
  await copyFile(inject('templateDatabasePath'), file);
  process.env.DATABASE_URL = `file:${file}`;
  const db = createPrismaClient(`file:${file}`);
  (globalThis as typeof globalThis & { leaseLoopDb?: typeof db }).leaseLoopDb = db;
  return {
    db,
    async cleanup() {
      await db.$disconnect();
      delete (globalThis as typeof globalThis & { leaseLoopDb?: typeof db }).leaseLoopDb;
      await rm(dir, { recursive: true, force: true });
    },
  };
}
