// Local provisioning only: never expose role assignment through a customer API.
import { existsSync } from 'node:fs';
import { withAudit } from '../src/server/audit';
import { createPrismaClient } from '../src/server/prisma-client';

if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.NODE_ENV === 'production')
  throw new Error('Use your production access-management procedure.');
const target = process.argv[2];
if (!target) throw new Error('Usage: npm run staff:grant -- email-address (or --only-local-user)');
const db = createPrismaClient();
try {
  const users =
    target === '--only-local-user'
      ? await db.user.findMany({ select: { id: true, role: true } })
      : await db.user.findMany({
          where: { email: target.trim().toLowerCase() },
          select: { id: true, role: true },
        });
  if (users.length !== 1) throw new Error('Expected one existing account; no roles changed.');
  const user = users[0]!;
  if (user.role !== 'staff')
    await withAudit(
      db,
      {
        actor: 'local-staff-provisioning',
        action: 'user.staff_granted',
        entityType: 'user',
        entityId: user.id,
      },
      (tx) => tx.user.update({ where: { id: user.id }, data: { role: 'staff' } })
    );
  console.log(
    'Staff access enabled for the selected account. Open /en/staff/returns after signing in.'
  );
} finally {
  await db.$disconnect();
}
