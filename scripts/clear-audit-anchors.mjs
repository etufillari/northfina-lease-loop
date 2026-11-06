// `npm run db:reset` starts the database over, so it starts the anchor file over too (D81):
// anchors of rows that no longer exist would read as a rewritten log. Only this explicit
// reset removes it; the app never does. The timestamp receipts in audit-tsa/ are kept.
import { existsSync, rmSync } from 'node:fs';
import process from 'node:process';

if (existsSync('.env')) process.loadEnvFile('.env');
const { createPrismaClient } = await import('../src/server/prisma-client.ts');
const { anchorFileFor } = await import('../src/server/audit-anchors.ts');
const db = createPrismaClient();
const file = anchorFileFor(db);
if (file && existsSync(file)) {
  rmSync(file);
  console.log(`🧹 Removed the audit anchors of the old database (${file})`);
}
await db.$disconnect();
