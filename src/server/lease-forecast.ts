// The dealer's forecast, read from the database: active leases ending in a date range, with
// the asset, the customer and any return request the customer already made.
import { loadCustomers } from '@/data/load';
import { assetCategorySchema, type AssetCategory, type Customer } from '@/data/schemas';
import {
  buildForecast,
  resolveForecastRange,
  type ForecastLease,
  type ForecastPreset,
  type ForecastRange,
  type ForecastSummary,
} from '@/domain/lease-forecast';

import { ApiError } from './api-response';
import type { PrismaClient } from './prisma-client';

// A return that is still being worked on. Completed and cancelled ones no longer need the dealer.
const OPEN_RETURN_STATUSES = ['requested', 'received', 'inspected', 'planned', 'approved'];

export type LeaseForecastItem = ForecastLease & {
  daysUntilEnd: number;
  phase: 'overdue' | 'soon' | 'upcoming';
  asset: { id: string; category: AssetCategory; make: string; model: string };
  /** null when the customer is not in the data pack */
  customerName: string | null;
};

export type LeaseForecastResult = {
  today: string;
  range: ForecastRange;
  preset: ForecastPreset | null;
  entries: LeaseForecastItem[];
  summary: ForecastSummary;
};

const RANGE_MESSAGES = {
  invalid_date: 'The dates must be real days, written YYYY-MM-DD.',
  incomplete_range: 'Give both a start and an end date.',
  from_after_to: 'The start date must not be after the end date.',
  range_too_long: 'The range can be at most two years.',
} as const;

/**
 * Active leases whose last day falls in the range, soonest first. With no dates the range is
 * next calendar month. A range the dealer typed wrong is a 400 with a code the UI can explain.
 * `today` comes from the caller, as everywhere: this function never reads the clock.
 */
export async function getLeaseForecast(
  db: PrismaClient,
  input: {
    today: string;
    from?: string | undefined;
    to?: string | undefined;
    customers?: readonly Customer[];
  }
): Promise<LeaseForecastResult> {
  const resolved = resolveForecastRange(input.today, { from: input.from, to: input.to });
  if (!resolved.ok) {
    throw new ApiError(
      400,
      `INVALID_RANGE_${resolved.reason.toUpperCase()}`,
      RANGE_MESSAGES[resolved.reason]
    );
  }
  const { range } = resolved;

  const [rows, allCustomers] = await Promise.all([
    db.contract.findMany({
      where: { status: 'active', end_date: { gte: range.from, lte: range.to } },
      include: {
        asset: true,
        return_requests: { where: { status: { in: OPEN_RETURN_STATUSES } }, take: 1 },
      },
    }),
    input.customers ?? loadCustomers(),
  ]);
  const customers = new Map(allCustomers.map((customer) => [customer.id, customer]));

  const leases: ForecastLease[] = rows.map((row) => {
    const openReturn = row.return_requests[0];
    return {
      contractId: row.id,
      assetId: row.asset_id,
      category: assetCategorySchema.parse(row.asset.category),
      customerId: row.customer_id,
      endDate: row.end_date,
      openReturn: openReturn ? { id: openReturn.id, status: openReturn.status } : null,
    };
  });
  const assetsById = new Map(rows.map((row) => [row.asset_id, row.asset]));

  const forecast = buildForecast({ today: input.today, range, leases });

  return {
    today: input.today,
    range,
    preset: resolved.preset,
    summary: forecast.summary,
    entries: forecast.entries.map((entry) => {
      const asset = assetsById.get(entry.assetId);
      if (!asset) throw new Error(`forecast entry for unknown asset ${entry.assetId}`);
      return {
        ...entry,
        asset: {
          id: asset.id,
          category: entry.category,
          make: asset.make,
          model: asset.model,
        },
        customerName: customers.get(entry.customerId)?.name ?? null,
      };
    }),
  };
}
