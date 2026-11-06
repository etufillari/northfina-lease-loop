// Creates a Prisma client for a SQLite file. Prisma 7 talks to SQLite through a
// "driver adapter" (better-sqlite3) instead of a built-in engine.
import path from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * The SQLite file a client opened, so the audit anchors can sit beside it (D81). Kept on the
 * client under a global symbol, not in a module-level map: Next.js loads this module once per
 * bundle while src/server/db.ts shares one client through globalThis, so a map in one bundle
 * would not know the client another bundle made.
 */
const DATABASE_FILE = Symbol.for('lease-loop.databaseFile');
type WithFile = { [DATABASE_FILE]?: string };

/** `databaseUrl` looks like `file:./dev.db`; a relative path is resolved from the current folder. */
export function createPrismaClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Run `npm run db:setup` to create .env and the database.'
    );
  }
  const client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
  const file = sqliteFileOf(databaseUrl);
  if (file) (client as unknown as WithFile)[DATABASE_FILE] = file;
  return client;
}

/** The absolute path of a `file:` URL's database; null for anything else (`:memory:`). */
export function sqliteFileOf(databaseUrl: string): string | null {
  if (!databaseUrl.startsWith('file:')) return null;
  const file = databaseUrl.slice('file:'.length).split('?')[0]!;
  if (file === '' || file === ':memory:') return null;
  return path.resolve(file);
}

/**
 * The file `client` was created on; for a client not made by createPrismaClient (one kept on
 * globalThis from before a reload), the file DATABASE_URL names; null when neither is a file.
 */
export function databaseFileOf(
  client: PrismaClient,
  databaseUrl = process.env.DATABASE_URL
): string | null {
  const file = (client as unknown as WithFile)[DATABASE_FILE];
  if (file) return file;
  return databaseUrl ? sqliteFileOf(databaseUrl) : null;
}

export type { PrismaClient };
