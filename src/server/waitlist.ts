// The second-life waiting list rows, seeded from data/second-life-demand.json.
import { secondLifeRequestSchema, type SecondLifeRequest } from '@/data/schemas';
import type { PrismaClient, WaitlistEntry } from '@/generated/prisma/client';

/** A waiting-list row back in the data-pack shape the domain expects. */
export function toSecondLifeRequest(row: WaitlistEntry): SecondLifeRequest {
  return secondLifeRequestSchema.parse({
    id: row.id,
    category: row.category,
    max_monthly_net_rent_cents: row.max_monthly_net_rent_cents,
    min_monthly_net_rent_cents: row.min_monthly_net_rent_cents,
    min_condition: row.min_condition,
    preferred_term_months: row.preferred_term_months,
    needed_by: row.needed_by,
    joined_on: row.joined_on,
    quantity: row.quantity,
    customer_id: row.customer_id ?? undefined,
    who: row.who,
  });
}

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
        min_monthly_net_rent_cents: entry.min_monthly_net_rent_cents,
        min_condition: entry.min_condition,
        preferred_term_months: entry.preferred_term_months,
        needed_by: entry.needed_by,
        joined_on: entry.joined_on,
        quantity: entry.quantity,
        customer_id: entry.customer_id ?? null,
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
