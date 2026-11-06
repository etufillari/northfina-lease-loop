// The CO2 a customer's leases avoid, for "My page". Every refurbishment stamps the kg it
// avoids on the passport (second-life.ts); that credit belongs to the customer whose lease
// STARTED the life — the first `leased` event after the `refurbished` one. A mid-life
// take-over is not a new life, so the credit stays with the first lessee, and a first life
// (no refurbishment before it) avoids nothing (see the passport page).
// An item the data pack lists as already used (previous_lives >= 1) but with no recorded
// earlier life has no refurbishment event: the lease that first takes it gets a stand-in
// credit, priced as if that earlier life lasted UNRECORDED_PRIOR_LIFE_MONTHS (domain/co2.ts).
import {
  loadAssets,
  loadCo2Factors,
  loadPriceLists,
  loadRefurbishmentCosts,
  loadResidualCurves,
} from '@/data/load';
import { unrecordedLifeCo2Kg } from '@/domain/co2';
import { listPriceOn } from '@/domain/price-list';
import { valueUsage } from '@/domain/usage';
import type { PrismaClient } from '@/generated/prisma/client';
import type { TransactionClient } from './audit';
import { ORIGINAL_PRICE_DATE } from './second-life';

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
  credits.push(...(await unrecordedLifeCredits(customerId, leased, refurbished, after)));
  credits.sort((a, b) => (a.onDate < b.onDate ? -1 : a.onDate > b.onDate ? 1 : 0));
  return { totalKg: credits.reduce((sum, credit) => sum + credit.kg, 0), credits };
}

type EventRow = { asset_id: string; on_date: string; id: number; details_json: string | null };

/**
 * Stand-in credits for items that arrived used without history: the customer's lease must be
 * the item's first lease in the app, with no refurbishment before it. The starting state
 * comes from the data pack, so later returns and refurbishments do not change the figure.
 */
async function unrecordedLifeCredits(
  customerId: string,
  leased: EventRow[],
  refurbished: EventRow[],
  after: (a: EventRow, b: EventRow) => boolean
): Promise<Co2Credit[]> {
  const [assets, priceLists, curves, factors, costs] = await Promise.all([
    loadAssets(),
    loadPriceLists(),
    loadResidualCurves(),
    loadCo2Factors(),
    loadRefurbishmentCosts(),
  ]);
  const credits: Co2Credit[] = [];
  for (const asset of assets) {
    if (asset.previous_lives < 1) continue;
    const first = leased.find((event) => event.asset_id === asset.id);
    if (!first || details(first.details_json).customerId !== customerId) continue;
    if (refurbished.some((e) => e.asset_id === asset.id && after(first, e))) continue;
    const price = listPriceOn(priceLists, asset.id, ORIGINAL_PRICE_DATE);
    if (!price.ok) continue;
    const kg = unrecordedLifeCo2Kg(
      {
        category: asset.category,
        condition: asset.condition,
        usageValue: valueUsage(asset, costs),
        previousLives: asset.previous_lives,
        originalListPriceCents: price.priceCents,
      },
      curves,
      factors
    );
    if (kg <= 0) continue;
    credits.push({ assetId: asset.id, life: asset.previous_lives + 1, onDate: first.on_date, kg });
  }
  return credits;
}

function details(json: string | null): Record<string, unknown> {
  if (json === null) return {};
  const value: unknown = JSON.parse(json);
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
