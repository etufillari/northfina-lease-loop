import { beforeAll, describe, expect, it } from 'vitest';
import { loadCo2Factors } from '@/data/load';
import type { Co2Factors } from '@/data/schemas';
import { itemPassport, type PassportContract } from './item-passport';

let factors: Co2Factors;
beforeAll(async () => {
  factors = await loadCo2Factors();
});

// 165 kg to make an e-bike × (1 − 0.12 refurbishment share) = 145.2 kg, × condition share.
const good = 130.7; // × 0.9
const ebike008 = { category: 'e_bike' as const, condition: 'good' as const, previousLives: 2 };
const lifeTwo: PassportContract = {
  startDate: '2025-05-06',
  endedOn: '2026-10-20',
  status: 'returned',
  termMonths: 36,
  startCondition: 'good',
};

describe('itemPassport', () => {
  it('card 10: lists ebike-008 lives, including the one before our records', () => {
    const passport = itemPassport(ebike008, [lifeTwo], factors);
    expect(passport.lives.map(({ number, recorded }) => ({ number, recorded }))).toEqual([
      { number: 1, recorded: false },
      { number: 2, recorded: true },
    ]);
    // The first life made the bike; the second avoided making a new one.
    expect(passport.lives.map((life) => life.co2AvoidedKg)).toEqual([0, good]);
    expect(passport.co2AvoidedKg).toBe(good);
  });

  it('adds the third life once it is leased again', () => {
    const third: PassportContract = {
      startDate: '2026-11-06',
      endedOn: null,
      status: 'active',
      termMonths: 24,
      startCondition: 'good',
    };
    const passport = itemPassport(ebike008, [third, lifeTwo], factors);
    expect(passport.lives.map((life) => [life.number, life.startDate, life.status])).toEqual([
      [1, null, null],
      [2, '2025-05-06', 'returned'],
      [3, '2026-11-06', 'active'],
    ]);
    expect(passport.co2AvoidedKg).toBe(Math.round(good * 2 * 10) / 10);
  });

  it('uses the condition at the start of each life, or the current one when unknown', () => {
    const fair = { ...lifeTwo, startCondition: 'fair' };
    expect(itemPassport(ebike008, [fair], factors).lives[1]!.co2AvoidedKg).toBe(101.6);
    const unknown = { ...lifeTwo, startCondition: null };
    expect(itemPassport(ebike008, [unknown], factors).lives[1]).toMatchObject({
      startCondition: null,
      co2AvoidedKg: good,
    });
  });

  it('ignores a contract still waiting for its signatory', () => {
    const waiting = { ...lifeTwo, status: 'awaiting_signature', endedOn: null };
    const passport = itemPassport({ ...ebike008, previousLives: 0 }, [waiting], factors);
    expect(passport.lives).toEqual([]);
    expect(passport.co2AvoidedKg).toBe(0);
  });

  it('shows a new item as its first life, with nothing avoided yet', () => {
    const first = { ...lifeTwo, status: 'active', endedOn: null };
    const passport = itemPassport({ ...ebike008, previousLives: 0 }, [first], factors);
    expect(passport.lives).toHaveLength(1);
    expect(passport.co2AvoidedKg).toBe(0);
  });
});
