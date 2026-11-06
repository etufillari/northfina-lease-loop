// Reading return requests for the dealer screens: the list, and one request with its
// inspection and refurbishment plan. Read-only; the changes live in ./returns.ts.
import { z } from 'zod';

import { loadCustomers } from '@/data/load';
import {
  assetCategorySchema,
  assetConditionSchema,
  usageUnitSchema,
  type AssetCategory,
  type AssetCondition,
  type Customer,
  type UsageUnit,
} from '@/data/schemas';
import {
  isReturnStatus,
  returnNextAction,
  type ReturnNextAction,
  type ReturnStatus,
} from '@/domain/return-workflow';

import { ApiError } from './api-response';
import type { PrismaClient } from './prisma-client';

export type ReturnListItem = {
  id: string;
  status: ReturnStatus;
  nextAction: ReturnNextAction;
  /** ISO date the customer expects to hand the item back, if they said. */
  expectedReturnDate: string | null;
  createdAt: string;
  customer: {
    id: string;
    /** null when the customer is not in the data pack */ name: string | null;
  };
  contract: { id: string; endDate: string };
  asset: {
    id: string;
    category: AssetCategory;
    make: string;
    model: string;
    condition: AssetCondition;
    usage: { unit: UsageUnit; value: number };
  };
};

// The plan as saved by planReturn() in ./returns.ts.
const savedPlanSchema = z.object({
  targetCondition: assetConditionSchema,
  inspectedCondition: assetConditionSchema,
  actions: z.array(
    z.object({ id: z.string(), costCents: z.number().int(), quantity: z.number().int() })
  ),
  totalCostCents: z.number().int(),
  resultingCondition: assetConditionSchema,
  inspectedUsage: z.object({ unit: usageUnitSchema, value: z.number().int() }),
  resultingUsage: z.number().int(),
  usageReset: z.boolean(),
});
export type ReturnPlan = z.infer<typeof savedPlanSchema>;

export type ReturnDetail = ReturnListItem & {
  received: { at: string; by: string } | null;
  inspection: {
    at: string;
    by: string;
    condition: AssetCondition;
    usageUnit: UsageUnit;
    usageValue: number;
    usageSinceLastService: number | null;
  } | null;
  plan: ReturnPlan | null;
};

const FINISHED: ReturnStatus[] = ['completed', 'cancelled'];

type Row = Awaited<ReturnType<typeof findRows>>[number];

function findRows(db: PrismaClient, where: { id?: string; status?: string }) {
  return db.returnRequest.findMany({
    where,
    include: { asset: true, contract: true },
  });
}

function toListItem(row: Row, customers: ReadonlyMap<string, Customer>): ReturnListItem {
  if (!isReturnStatus(row.status)) {
    // The database holds a value no code writes: a bug or a hand edit, not a user error.
    throw new Error(`return request ${row.id} has unknown status "${row.status}"`);
  }
  return {
    id: row.id,
    status: row.status,
    nextAction: returnNextAction(row.status),
    expectedReturnDate: row.expected_return_date,
    createdAt: row.created_at.toISOString(),
    customer: { id: row.customer_id, name: customers.get(row.customer_id)?.name ?? null },
    contract: { id: row.contract_id, endDate: row.contract.end_date },
    asset: {
      id: row.asset.id,
      category: assetCategorySchema.parse(row.asset.category),
      make: row.asset.make,
      model: row.asset.model,
      condition: assetConditionSchema.parse(row.asset.condition),
      usage: { unit: usageUnitSchema.parse(row.asset.usage_unit), value: row.asset.usage_value },
    },
  };
}

async function customersById(customers?: readonly Customer[]) {
  const all = customers ?? (await loadCustomers());
  return new Map(all.map((customer) => [customer.id, customer]));
}

/** Compares two nullable ISO dates, earliest first, missing dates last. */
function byExpectedDate(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * All return requests, in the order a dealer works through them: open requests first, by
 * expected return date (soonest first, undated last), then oldest request first. Finished
 * requests (completed, cancelled) follow.
 */
export async function listReturnRequests(
  db: PrismaClient,
  options: { status?: string; customers?: readonly Customer[] } = {}
): Promise<ReturnListItem[]> {
  if (options.status !== undefined && !isReturnStatus(options.status)) {
    throw new ApiError(400, 'INVALID_STATUS', 'This return status does not exist.');
  }
  const [rows, customers] = await Promise.all([
    findRows(db, options.status === undefined ? {} : { status: options.status }),
    customersById(options.customers),
  ]);
  return rows
    .map((row) => toListItem(row, customers))
    .sort((a, b) => {
      const finished = Number(FINISHED.includes(a.status)) - Number(FINISHED.includes(b.status));
      if (finished !== 0) return finished;
      return (
        byExpectedDate(a.expectedReturnDate, b.expectedReturnDate) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id)
      );
    });
}

/** One return request with the receipt, inspection and refurbishment plan recorded so far. */
export async function getReturnRequest(
  db: PrismaClient,
  id: string,
  options: { customers?: readonly Customer[] } = {}
): Promise<ReturnDetail> {
  const [rows, customers] = await Promise.all([
    findRows(db, { id }),
    customersById(options.customers),
  ]);
  const row = rows[0];
  if (!row) {
    throw new ApiError(404, 'RETURN_REQUEST_NOT_FOUND', 'This return request does not exist.');
  }

  const received =
    row.received_at && row.received_by
      ? { at: row.received_at.toISOString(), by: row.received_by }
      : null;

  const inspection =
    row.inspected_at &&
    row.inspected_by &&
    row.inspected_condition !== null &&
    row.inspected_usage_unit !== null &&
    row.inspected_usage_value !== null
      ? {
          at: row.inspected_at.toISOString(),
          by: row.inspected_by,
          condition: assetConditionSchema.parse(row.inspected_condition),
          usageUnit: usageUnitSchema.parse(row.inspected_usage_unit),
          usageValue: row.inspected_usage_value,
          usageSinceLastService: row.usage_since_last_service,
        }
      : null;

  const plan =
    row.refurbishment_plan_json === null
      ? null
      : savedPlanSchema.parse(JSON.parse(row.refurbishment_plan_json));

  return { ...toListItem(row, customers), received, inspection, plan };
}
