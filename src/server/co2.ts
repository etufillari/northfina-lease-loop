// The CO2 a customer's leases avoid, for "My page". Every refurbishment stamps the kg it
// avoids on the passport (second-life.ts); that credit belongs to the customer whose lease
// STARTED the life — the first `leased` event after the `refurbished` one. A mid-life
// take-over is not a new life, so the credit stays with the first lessee, and a first life
// (no refurbishment before it) avoids nothing (see the passport page).
import type { PrismaClient } from '@/generated/prisma/client';
import type { TransactionClient } from './audit';

type Reader = PrismaClient | TransactionClient;

export type Co2Credit = {
  assetId: string;
  /** Which life of the item this lease started (2 = first re-lease). */
  life: number;
  /** The day the lease started. */
  onDate: string;
  kg: number;
};

export type Co2Saved = { totalKg: number; credits: Co2Credit[] };

/** kg CO2e this customer's leases avoided, with one line per credited life. */
export async function co2SavedFor(db: Reader, customerId: string): Promise<Co2Saved> {
  // One pass over the events of every asset the customer ever leased.
  const leased = await db.assetEvent.findMany({
    where: { type: 'leased' },
    orderBy: [{ on_date: 'asc' }, { id: 'asc' }],
  });
  const mine = leased.filter((event) => details(event.details_json).customerId === customerId);
  if (mine.length === 0) return { totalKg: 0, credits: [] };

  const refurbished = await db.assetEvent.findMany({
    where: { type: 'refurbished', asset_id: { in: mine.map((event) => event.asset_id) } },
    orderBy: [{ on_date: 'asc' }, { id: 'asc' }],
  });

  const after = (a: { on_date: string; id: number }, b: { on_date: string; id: number }) =>
    a.on_date > b.on_date || (a.on_date === b.on_date && a.id > b.id);

  const credits: Co2Credit[] = [];
  for (const refurb of refurbished) {
    const info = details(refurb.details_json);
    if (typeof info.co2AvoidedKg !== 'number' || info.co2AvoidedKg <= 0) continue;
    // The lease that started this life: the first one after the refurbishment (same-day
    // desk work comes first by id) and before the next refurbishment of the same item.
    // Old demo data without recorded kg simply counts 0.
    const nextRefurb = refurbished.find((e) => e.asset_id === refurb.asset_id && after(e, refurb));
    const first = leased.find(
      (event) =>
        event.asset_id === refurb.asset_id &&
        after(event, refurb) &&
        (!nextRefurb || after(nextRefurb, event))
    );
    if (!first || details(first.details_json).customerId !== customerId) continue;
    credits.push({
      assetId: refurb.asset_id,
      life: typeof info.life === 'number' ? info.life : 0,
      onDate: first.on_date,
      kg: info.co2AvoidedKg,
    });
  }
  return { totalKg: credits.reduce((sum, credit) => sum + credit.kg, 0), credits };
}

function details(json: string | null): Record<string, unknown> {
  if (json === null) return {};
  const value: unknown = JSON.parse(json);
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
