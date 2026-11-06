// The app's one Prisma client. Import `db` from here in routes and pages.
// In development Next.js reloads modules on every change; keeping the client on
// globalThis stops each reload from opening another database connection.
import { createPrismaClient, type PrismaClient } from './prisma-client';

const globalForPrisma = globalThis as typeof globalThis & { leaseLoopDb?: PrismaClient };

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client =
      globalForPrisma.leaseLoopDb ?? (globalForPrisma.leaseLoopDb = createPrismaClient());
    const val = Reflect.get(client, prop);
    return typeof val === 'function' ? val.bind(client) : val;
  },
});
