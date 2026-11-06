import { describe, expect, it } from 'vitest';
import { loadRefurbishmentCosts } from '@/data/load';
import { planRefurbishment } from './refurbishment';

describe('planRefurbishment', () => {
  it('requires poor e-bikes to reach good and includes applicable battery work', async () => {
    const costs = await loadRefurbishmentCosts();
    const result = planRefurbishment(
      {
        category: 'e_bike',
        condition: 'poor',
        usage: { unit: 'km', value: 15_000 },
      },
      costs
    );

    expect(result).toEqual({
      ok: true,
      value: {
        targetCondition: 'good',
        work: [
          {
            code: 'condition:poor->fair',
            kind: 'condition_upgrade',
            costCents: 15_000,
            mandatory: true,
            resetsUsage: false,
            fromCondition: 'poor',
            toCondition: 'fair',
          },
          {
            code: 'condition:fair->good',
            kind: 'condition_upgrade',
            costCents: 12_000,
            mandatory: true,
            resetsUsage: false,
            fromCondition: 'fair',
            toCondition: 'good',
          },
          {
            code: 'fixed:battery_replacement',
            kind: 'fixed',
            costCents: 35_000,
            mandatory: false,
            resetsUsage: true,
          },
          {
            code: 'fixed:safety_inspection',
            kind: 'fixed',
            costCents: 4_500,
            mandatory: false,
            resetsUsage: false,
          },
        ],
        totalCostCents: 66_500,
        mandatoryCostCents: 27_000,
      },
    });
  });

  it('requires a fair-condition item to be upgraded to good in this slice', async () => {
    const costs = await loadRefurbishmentCosts();
    const result = planRefurbishment(
      {
        category: 'e_bike',
        condition: 'fair',
        usage: { unit: 'km', value: 1_000 },
      },
      costs
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        targetCondition: 'good',
        work: [
          {
            code: 'condition:fair->good',
            costCents: 12_000,
            mandatory: true,
            fromCondition: 'fair',
            toCondition: 'good',
          },
          { code: 'fixed:safety_inspection', costCents: 4_500 },
        ],
        totalCostCents: 16_500,
        mandatoryCostCents: 12_000,
      },
    });
  });

  it('marks dataset-mandatory work as blocking readiness', async () => {
    const costs = await loadRefurbishmentCosts();
    const result = planRefurbishment(
      {
        category: 'laptop',
        condition: 'good',
        usage: { unit: 'battery_cycles', value: 100 },
      },
      costs
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        work: [
          {
            code: 'fixed:certified_data_wipe',
            costCents: 2_500,
            mandatory: true,
            resetsUsage: false,
          },
        ],
        totalCostCents: 2_500,
        mandatoryCostCents: 2_500,
      },
    });
  });

  it('calculates farm service cost from an explicit last-service baseline', async () => {
    const costs = await loadRefurbishmentCosts();
    const result = planRefurbishment(
      {
        category: 'farm_machine',
        condition: 'good',
        usage: { unit: 'engine_hours', value: 1_550 },
        usageSinceLastService: { unit: 'engine_hours', value: 550 },
      },
      costs
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        work: [
          { code: 'fixed:major_service', costCents: 150_000, mandatory: false },
          { code: 'fixed:safety_inspection', costCents: 40_000, mandatory: false },
        ],
        totalCostCents: 190_000,
        mandatoryCostCents: 0,
      },
    });
  });

  it('rejects category-mismatched usage and farm usage without service history', async () => {
    const costs = await loadRefurbishmentCosts();
    expect(
      planRefurbishment(
        {
          category: 'e_bike',
          condition: 'good',
          usage: { unit: 'battery_cycles', value: 100 },
        },
        costs
      )
    ).toEqual({ ok: false, reason: 'invalid_usage_unit' });
    expect(
      planRefurbishment(
        {
          category: 'farm_machine',
          condition: 'good',
          usage: { unit: 'engine_hours', value: 100 },
        },
        costs
      )
    ).toEqual({ ok: false, reason: 'missing_service_baseline' });
  });
});
