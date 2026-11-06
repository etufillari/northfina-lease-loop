import { beforeAll, describe, expect, it } from 'vitest';
import { loadRefurbishmentCosts } from '@/data/load';
import type { RefurbishmentCosts } from '@/data/schemas';
import { refurbishmentQuoteFor } from './refurbishment';

let costs: RefurbishmentCosts;

beforeAll(async () => {
  costs = await loadRefurbishmentCosts();
});

describe('refurbishmentQuoteFor', () => {
  it('upgrades a returned e-bike and resets usage after battery replacement', () => {
    const result = refurbishmentQuoteFor(
      {
        category: 'e_bike',
        condition: 'fair',
        usage: { unit: 'km', value: 18_400 },
      },
      costs
    );

    expect(result).toEqual({
      ok: true,
      quote: {
        currentCondition: 'fair',
        targetCondition: 'good',
        conditionUpgradeCents: 12_000,
        fixedWork: [
          {
            id: 'battery_replacement',
            description: 'usage.value >= 15000 km',
            quantity: 1,
            unitCostCents: 35_000,
            costCents: 35_000,
            resetsUsage: true,
            mandatoryBeforeNextLease: false,
          },
          {
            id: 'safety_inspection',
            description: 'always',
            quantity: 1,
            unitCostCents: 4_500,
            costCents: 4_500,
            resetsUsage: false,
            mandatoryBeforeNextLease: false,
          },
        ],
        totalCostCents: 51_500,
        usageAfterValue: 0,
        usageReset: true,
      },
    });
  });

  it('does not charge threshold work below the threshold', () => {
    const result = refurbishmentQuoteFor(
      {
        category: 'e_bike',
        condition: 'good',
        usage: { unit: 'km', value: 14_999 },
      },
      costs
    );

    expect(result).toMatchObject({
      ok: true,
      quote: { conditionUpgradeCents: 0, totalCostCents: 4_500, usageAfterValue: 14_999 },
    });
  });

  it('adds laptop data wipe and battery replacement at the exact threshold', () => {
    const result = refurbishmentQuoteFor(
      {
        category: 'laptop',
        condition: 'good',
        usage: { unit: 'battery_cycles', value: 500 },
      },
      costs,
      'like_new'
    );

    expect(result).toMatchObject({
      ok: true,
      quote: {
        conditionUpgradeCents: 5_000,
        totalCostCents: 16_500,
        usageAfterValue: 0,
        usageReset: true,
      },
    });
  });

  it('charges one farm service for every started 1000 hours', () => {
    const result = refurbishmentQuoteFor(
      {
        category: 'farm_machine',
        condition: 'fair',
        usage: { unit: 'engine_hours', value: 2_001 },
      },
      costs
    );

    expect(result).toMatchObject({
      ok: true,
      quote: { conditionUpgradeCents: 450_000, totalCostCents: 940_000 },
    });
  });

  it('requires at least good and rejects unreachable upgrades', () => {
    expect(
      refurbishmentQuoteFor(
        { category: 'e_bike', condition: 'poor', usage: { unit: 'km', value: 0 } },
        costs,
        'fair'
      )
    ).toEqual({ ok: false, reason: 'minimum_condition_required', targetCondition: 'fair' });

    expect(
      refurbishmentQuoteFor(
        { category: 'e_bike', condition: 'like_new', usage: { unit: 'km', value: 0 } },
        costs,
        'new'
      )
    ).toEqual({
      ok: false,
      reason: 'target_condition_not_reachable',
      currentCondition: 'like_new',
      targetCondition: 'new',
    });
  });
});
