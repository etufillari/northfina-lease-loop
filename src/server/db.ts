// The app's one Prisma client. Import `db` from here in routes and pages.
// In development Next.js reloads modules on every change; keeping the client on
// globalThis stops each reload from opening another database connection.
import { PrismaClient } from '@/generated/prisma/client';
import { createPrismaClient } from './prisma-client';

const globalForPrisma = globalThis as typeof globalThis & {
  leaseLoopDb?: PrismaClient;
  leaseLoopDbClientClass?: typeof PrismaClient;
};

// A regenerated client has a new constructor, even when Next retains globalThis.
// Reusing the old instance would leave new model delegates unavailable.
const cached = globalForPrisma.leaseLoopDb;
const canReuse =
  process.env.NODE_ENV !== 'production' && globalForPrisma.leaseLoopDbClientClass === PrismaClient;
export const db: PrismaClient = (canReuse && cached) || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  if (cached && cached !== db) void cached.$disconnect().catch(() => undefined);
  globalForPrisma.leaseLoopDb = db;
  globalForPrisma.leaseLoopDbClientClass = PrismaClient;
}
