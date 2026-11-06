// The demo's shared clock (one DemoClock row). The time-travel bar used to live in a
// browser cookie alone, so a second browser — another persona taking over a lease — acted
// on the REAL date while the first saw the demo date. The clock written here is what every
// request resolves as "today" (src/server/as-of.ts); the cookie remains only a fallback.
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit } from './audit';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The stored demo date, or null when the clock has never been set. */
export async function getDemoClock(db: PrismaClient): Promise<string | null> {
  try {
    const row = await db.demoClock.findUnique({ where: { id: 1 } });
    return row && ISO_DATE.test(row.as_of) ? row.as_of : null;
  } catch {
    // A Prisma client or database from before the clock existed: behave as "never set".
    return null;
  }
}

/** Moves the shared clock (audited: the demo date changes what every write is dated). */
export async function setDemoClock(db: PrismaClient, asOf: string, actor: string): Promise<void> {
  await withAudit(
    db,
    { actor, action: 'demo.clock_set', entityType: 'demo', entityId: 'clock', details: { asOf } },
    (tx) =>
      tx.demoClock.upsert({
        where: { id: 1 },
        create: { id: 1, as_of: asOf },
        update: { as_of: asOf },
      })
  );
}
