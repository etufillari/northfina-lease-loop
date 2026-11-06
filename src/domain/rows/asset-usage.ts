// The usage columns of an `Asset` row, checked where a return writes them back.
import { z } from 'zod';
import {
  assetCategorySchema,
  usageUnitSchema,
  type AssetCategory,
  type UsageUnit,
} from '@/data/schemas';
import { ON_VALID_FIELDS } from './fields';

const UNIT_BY_CATEGORY: Record<AssetCategory, UsageUnit> = {
  e_bike: 'km',
  laptop: 'battery_cycles',
  farm_machine: 'engine_hours',
};

/** What a category's usage counter measures (data/assets.json holds to it). */
export function usageUnitFor(category: AssetCategory): UsageUnit {
  return UNIT_BY_CATEGORY[category];
}

export const assetUsageSchema = z
  .strictObject({
    category: assetCategorySchema,
    usage_unit: usageUnitSchema,
    usage_value: z.number().int().nonnegative(),
  })
  .refine((usage) => usage.usage_unit === usageUnitFor(usage.category), {
    message: 'the usage unit is not the one this category counts',
    path: ['usage_unit'],
    ...ON_VALID_FIELDS,
  });
