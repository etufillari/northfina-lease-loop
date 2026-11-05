// The second-life waiting list rows, seeded from data/second-life-demand.json.
import type { SecondLifeRequest } from '@/data/schemas';
import type { PrismaClient } from '@/generated/prisma/client';

export async function seedWaitlist(db: PrismaClient, demand: readonly SecondLifeRequest[]) {
  let created = 0;
  for (const entry of demand) {
    const existing = await db.waitlistEntry.findUnique({ where: { id: entry.id } });
    if (existing) continue;
    await db.waitlistEntry.create({
      data: {
        id: entry.id,
        category: entry.category,
        max_monthly_net_rent_cents: entry.max_monthly_net_rent_cents,
        min_condition: entry.min_condition,
        preferred_term_months: entry.preferred_term_months,
        needed_by: entry.needed_by,
        joined_on: entry.joined_on,
        who: entry.who,
      },
    });
    created++;
  }
  return { created, skipped: demand.length - created };
}

export function listWaitlist(db: PrismaClient) {
  return db.waitlistEntry.findMany({ orderBy: [{ joined_on: 'asc' }, { id: 'asc' }] });
}
