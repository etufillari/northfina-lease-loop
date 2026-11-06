// The item passport (scenario card 10, D-036): every life of one item and the CO₂ its extra lives
// avoided. Pure: the asset, its contracts, endings and re-listings all come in as arguments.
//
// Lives before Lease Loop come from the data pack's `previous_lives`; we have no record of them,
// so they are listed but not counted for CO₂. Every contract in our records is one life. The
// ending increments `previous_lives` (D-029), a re-listing does not (D-035).
import type {
  AssetCategory,
  AssetCondition,
  AssetStatus,
  Co2Factors,
  ResidualCurves,
} from '@/data/schemas';
import { avoidedByExtraLife, sumAvoidedKg, type AvoidedCo2 } from './co2';
import type { EndingKind } from './end-of-term';
import { firstLeasedNewOn, itemAgeOn, type AgeClock } from './item-age';

export interface Readings {
  condition: AssetCondition;
  usageValue: number;
}

export interface PassportAsset {
  category: AssetCategory;
  modelYear: number;
  /** The count in our database: the data pack's value plus one per ending we recorded. */
  previousLives: number;
  /** The item as the data pack handed it to Lease Loop. */
  received: Readings & { status: AssetStatus };
}

export interface PassportEnding {
  kind: EndingKind;
  effectiveDate: string;
  /** Condition and usage at the return; none when the lessee bought the item. */
  inspection: Readings | null;
}

export interface PassportContract {
  id: number;
  /** When the row was written, for ordering against re-listings (ISO timestamp). */
  recordedAt: string;
  customerId: string;
  signDate: string;
  startDate: string;
  termMonths: number;
  listPriceCents: number;
  monthlyNetRentCents: number;
  ending: PassportEnding | null;
}

export interface PassportListing {
  id: number;
  recordedAt: string;
  listedOn: string;
  before: Readings;
  after: Readings;
  refurbishmentCents: number;
  listPriceCents: number;
}

export interface EarlierLife {
  number: number;
  /** The readings it came back with, known only for the last one when the data says `returned`. */
  returned: Readings | null;
}

export interface LeaseLoopLife {
  number: number;
  contract: PassportContract;
  /** The re-listing that prepared the item for this life, if any. */
  refurbishment: PassportListing | null;
  /** Condition and usage when the life started. */
  delivered: Readings;
  ageMonths: number;
  /** CO₂ avoided; null for a first life, which is the item's own manufacturing. */
  co2: AvoidedCo2 | null;
}

export interface Passport {
  earlierLives: EarlierLife[];
  lives: LeaseLoopLife[];
  /** A re-listing not yet leased: the next life is ready. */
  nextListing: PassportListing | null;
  /** Sum of the counted lives' rounded kilograms. */
  avoidedKg: number;
}

type Event =
  | { type: 'contract'; recordedAt: string; id: number; contract: PassportContract }
  | { type: 'listing'; recordedAt: string; id: number; listing: PassportListing };

function byRecordOrder(a: Event, b: Event): number {
  if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? -1 : 1;
  if (a.type !== b.type) return a.type === 'listing' ? -1 : 1;
  return a.id - b.id;
}

export function buildPassport(
  data: { factors: Co2Factors; curves: ResidualCurves },
  asset: PassportAsset,
  contracts: readonly PassportContract[],
  listings: readonly PassportListing[]
): Passport {
  const endings = contracts.filter((c) => c.ending !== null).length;
  const earlierCount = Math.max(0, asset.previousLives - endings);
  const { status, ...receivedReadings } = asset.received;
  const earlierLives: EarlierLife[] = Array.from({ length: earlierCount }, (_, i) => ({
    number: i + 1,
    returned: i === earlierCount - 1 && status === 'returned' ? receivedReadings : null,
  }));

  const events: Event[] = [
    ...contracts.map((c) => ({
      type: 'contract' as const,
      recordedAt: c.recordedAt,
      id: c.id,
      contract: c,
    })),
    ...listings.map((l) => ({
      type: 'listing' as const,
      recordedAt: l.recordedAt,
      id: l.id,
      listing: l,
    })),
  ].sort(byRecordOrder);

  // One age rule with early exit and second life (D-042): an item we received new and unleased
  // is 0 months old on its first lease start.
  const firstLease = events.find((e) => e.type === 'contract');
  const clock: AgeClock = {
    modelYear: asset.modelYear,
    firstLeasedNewOn: firstLeasedNewOn(
      { condition: receivedReadings.condition, previousLives: earlierCount },
      firstLease?.type === 'contract' ? firstLease.contract.startDate : null
    ),
  };

  const lives: LeaseLoopLife[] = [];
  let pending: PassportListing | null = null;
  let current: Readings = receivedReadings;
  for (const event of events) {
    if (event.type === 'listing') {
      pending = event.listing;
      current = event.listing.after;
      continue;
    }
    const { contract } = event;
    const number = earlierCount + lives.length + 1;
    const ageMonths = itemAgeOn(clock, contract.startDate);
    const co2 =
      number >= 2
        ? avoidedByExtraLife(data.factors, data.curves, {
            category: asset.category,
            ageMonths,
            condition: current.condition,
            usageValue: current.usageValue,
          })
        : null;
    lives.push({ number, contract, refurbishment: pending, delivered: current, ageMonths, co2 });
    pending = null;
    if (contract.ending?.inspection) current = contract.ending.inspection;
  }

  return {
    earlierLives,
    lives,
    nextListing: pending,
    avoidedKg: sumAvoidedKg(lives.flatMap((life) => (life.co2 ? [life.co2.avoidedKg] : []))),
  };
}
