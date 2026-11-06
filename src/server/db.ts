// The app's one Prisma client. Import `db` from here in routes and pages.
// In development Next.js reloads modules on every change; keeping the client on
// globalThis stops each reload from opening another database connection.
//
// After a migration, `prisma generate` writes a new client and Next.js reloads it as a new
// module, so its PrismaClient class is a new class. A client cached from before is then an
// instance of the OLD class and doesn't know the new tables ("Cannot read properties of
// undefined (reading 'findMany')"). So we keep the cached client only while it was built from
// the current class, and otherwise replace it, without restarting `npm run dev`.
import { PrismaClient } from '@/generated/prisma/client';
import { createPrismaClient } from './prisma-client';

// Typed loosely on purpose: after a regeneration the cached value is an instance of an older
// class, which TypeScript can't describe.
type CachedClient = { $disconnect(): Promise<void> };
const globalForPrisma = globalThis as typeof globalThis & { leaseLoopDb?: CachedClient };

function currentClient(): PrismaClient {
  const cached = globalForPrisma.leaseLoopDb;
  if (cached instanceof PrismaClient) return cached;
  void cached?.$disconnect(); // built from an older generated client: close it
  return createPrismaClient();
}

export const db: PrismaClient = currentClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.leaseLoopDb = db;
}
