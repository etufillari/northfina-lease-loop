import { beforeAll, describe, expect, it } from 'vitest';
import { loadCo2Factors, loadResidualCurves } from '@/data/load';
import type { Co2Factors, ResidualCurves } from '@/data/schemas';
import {
  buildPassport,
  type PassportAsset,
  type PassportContract,
  type PassportListing,
} from './passport';

let data: { factors: Co2Factors; curves: ResidualCurves };
beforeAll(async () => {
  const [factors, curves] = await Promise.all([loadCo2Factors(), loadResidualCurves()]);
  data = { factors, curves };
});

// ebike-008 as the data pack has it: 2022, good, 9 800 km, 2 lives, returned.
const ebike008: PassportAsset = {
  category: 'e_bike',
  modelYear: 2022,
  previousLives: 2,
  received: { status: 'returned', condition: 'good', usageValue: 9_800 },
};

// Card 10's re-listing (D-035): only the safety inspection, so the readings don't change.
const listing008: PassportListing = {
  id: 1,
  recordedAt: '2026-11-06T09:00:00.000Z',
  listedOn: '2026-11-06',
  before: { condition: 'good', usageValue: 9_800 },
  after: { condition: 'good', usageValue: 9_800 },
  refurbishmentCents: 4_500,
  listPriceCents: 32_601,
};

function contract(overrides: Partial<PassportContract> & { id: number }): PassportContract {
  return {
    recordedAt: '2026-11-06T10:00:00.000Z',
    customerId: 'cust-aino',
    signDate: '2026-11-06',
    startDate: '2026-11-06',
    termMonths: 36,
    listPriceCents: 32_601,
    monthlyNetRentCents: 933,
    ending: null,
    ...overrides,
  };
}

describe('buildPassport', () => {
  it('an item with no lives has an empty passport', () => {
    const passport = buildPassport(
      data,
      {
        ...ebike008,
        previousLives: 0,
        received: { status: 'available', condition: 'new', usageValue: 0 },
      },
      [],
      []
    );
    expect(passport).toEqual({ earlierLives: [], lives: [], nextListing: null, avoidedKg: 0 });
  });

  it('ebike-008 as received: two lives before Lease Loop, the last one returned, nothing counted', () => {
    const passport = buildPassport(data, ebike008, [], []);
    expect(passport.earlierLives).toEqual([
      { number: 1, returned: null },
      { number: 2, returned: { condition: 'good', usageValue: 9_800 } },
    ]);
    expect(passport.lives).toEqual([]);
    expect(passport.avoidedKg).toBe(0);
  });

  it('a re-listing not yet leased is the next life, not a life', () => {
    const passport = buildPassport(data, ebike008, [], [listing008]);
    expect(passport.lives).toEqual([]);
    expect(passport.nextListing).toEqual(listing008);
  });

  it('card 10: re-listed and leased again is life 3, avoiding 26 kg', () => {
    // Starts 6 Nov 2026: 58 months → 26 %; good 0.85; 9 800 km → −18 %.
    // 165 × 0.88 × 0.26 × 0.85 × 0.82 = 26.313 → 26 kg
    const passport = buildPassport(data, ebike008, [contract({ id: 7 })], [listing008]);
    expect(passport.earlierLives).toHaveLength(2);
    expect(passport.lives).toHaveLength(1);
    const life = passport.lives[0]!;
    expect(life.number).toBe(3);
    expect(life.refurbishment).toEqual(listing008);
    expect(life.delivered).toEqual({ condition: 'good', usageValue: 9_800 });
    expect(life.ageMonths).toBe(58);
    expect(life.co2?.avoidedKg).toBe(26);
    expect(passport.nextListing).toBeNull();
    expect(passport.avoidedKg).toBe(26);
  });

  it('counts the ended life once: the ending raised previous_lives, the earlier lives stay 2', () => {
    const ended = contract({
      id: 7,
      ending: {
        kind: 'return',
        effectiveDate: '2029-11-06',
        inspection: { condition: 'fair', usageValue: 14_000 },
      },
    });
    const passport = buildPassport(data, { ...ebike008, previousLives: 3 }, [ended], [listing008]);
    expect(passport.earlierLives).toHaveLength(2);
    expect(passport.lives.map((life) => life.number)).toEqual([3]);
  });

  it('a new item: its first life avoids nothing, the second counts from the re-listing', () => {
    // A 2026 e-bike leased new, returned fair with 5 000 km, re-listed at good (5 000 km kept).
    // Its age counts from life 1's start, 5 Nov 2026 (D-042), not from January 2026.
    // Life 2 starts 12 Nov 2027: 12 months → 70 %; good 0.85; 5 steps −10 %.
    // 145.2 × 0.70 × 0.85 × 0.90 = 77.755 → 78 kg
    const asset: PassportAsset = {
      category: 'e_bike',
      modelYear: 2026,
      previousLives: 1,
      received: { status: 'available', condition: 'new', usageValue: 0 },
    };
    const first = contract({
      id: 1,
      recordedAt: '2026-11-05T10:00:00.000Z',
      startDate: '2026-11-05',
      ending: {
        kind: 'return',
        effectiveDate: '2027-11-05',
        inspection: { condition: 'fair', usageValue: 5_000 },
      },
    });
    const relisted: PassportListing = {
      id: 3,
      recordedAt: '2027-11-10T10:00:00.000Z',
      listedOn: '2027-11-10',
      before: { condition: 'fair', usageValue: 5_000 },
      after: { condition: 'good', usageValue: 5_000 },
      refurbishmentCents: 16_500,
      listPriceCents: 150_000,
    };
    const second = contract({
      id: 2,
      recordedAt: '2027-11-12T10:00:00.000Z',
      startDate: '2027-11-12',
    });
    // Passed in any order: the record order decides.
    const passport = buildPassport(data, asset, [second, first], [relisted]);
    expect(passport.earlierLives).toEqual([]);
    expect(passport.lives.map((life) => life.number)).toEqual([1, 2]);
    expect(passport.lives[0]!.co2).toBeNull();
    expect(passport.lives[0]!.delivered).toEqual({ condition: 'new', usageValue: 0 });
    expect(passport.lives[1]!.refurbishment).toEqual(relisted);
    expect(passport.lives.map((life) => life.ageMonths)).toEqual([0, 12]);
    expect(passport.lives[1]!.co2?.avoidedKg).toBe(78);
    expect(passport.avoidedKg).toBe(78);
  });

  it('a used item leased without a re-listing counts from the data-pack readings', () => {
    // ebike-005: 2025, like_new, 1 200 km, 1 life, available. Life 2 starts 5 Nov 2026:
    // 22 months → 55 %; like_new 0.95; 1 step −2 %. 145.2 × 0.55 × 0.95 × 0.98 = 74.350 → 74 kg
    const asset: PassportAsset = {
      category: 'e_bike',
      modelYear: 2025,
      previousLives: 1,
      received: { status: 'available', condition: 'like_new', usageValue: 1_200 },
    };
    const passport = buildPassport(data, asset, [contract({ id: 4, startDate: '2026-11-05' })], []);
    expect(passport.earlierLives).toEqual([{ number: 1, returned: null }]);
    expect(passport.lives[0]!.number).toBe(2);
    expect(passport.lives[0]!.refurbishment).toBeNull();
    expect(passport.lives[0]!.co2?.avoidedKg).toBe(74);
  });

  it('a listing and a contract written in the same instant: the listing came first', () => {
    const same = '2026-11-06T09:00:00.000Z';
    const passport = buildPassport(
      data,
      ebike008,
      [contract({ id: 7, recordedAt: same })],
      [{ ...listing008, recordedAt: same }]
    );
    expect(passport.lives[0]!.refurbishment).not.toBeNull();
    expect(passport.nextListing).toBeNull();
  });
});
