// Reading customers from the database. Rows are converted to the same `Customer` shape as
// data/customers.json: the three types share one table, and the fields a type does not have
// are null in the row and absent in the shape.
import type { Customer as CustomerRow, PrismaClient } from '@/generated/prisma/client';
import type { TransactionClient } from './audit';
import { customerSchema, type Customer } from '@/data/schemas';

/** Database row → data-pack shape. Validates, so a bad value edited in by hand is caught. */
export function toCustomer(row: CustomerRow): Customer {
  const shape: Record<string, unknown> = {
    id: row.id,
    type: row.type,
    name: row.name,
    birth_date: row.birth_date,
    country: row.country,
    city: row.city,
    email: row.email,
    employment: row.employment,
    monthly_net_income_cents: row.monthly_net_income_cents,
    business_id: row.business_id,
    vat_registered: row.vat_registered,
    annual_revenue_cents: row.annual_revenue_cents,
    applicant_can_sign: row.applicant_can_sign,
    beneficial_owners:
      row.beneficial_owners_json === null ? null : JSON.parse(row.beneficial_owners_json),
    is_pep: row.is_pep,
    story: row.story,
  };
  // The schemas are strict and have no nullable fields: a null column is an absent field.
  const present = Object.fromEntries(Object.entries(shape).filter(([, value]) => value !== null));
  return customerSchema.parse(present);
}

/** Data-pack shape → columns for a new database row. */
export function toCustomerRowData(customer: Customer) {
  const common = {
    id: customer.id,
    type: customer.type,
    name: customer.name,
    country: customer.country,
    city: customer.city,
    email: customer.email,
    is_pep: customer.is_pep,
    story: customer.story,
  };
  switch (customer.type) {
    case 'consumer':
      return {
        ...common,
        birth_date: customer.birth_date,
        employment: customer.employment,
        monthly_net_income_cents: customer.monthly_net_income_cents,
      };
    case 'sole_trader':
      return {
        ...common,
        birth_date: customer.birth_date,
        business_id: customer.business_id,
        vat_registered: customer.vat_registered,
      };
    case 'company':
      return {
        ...common,
        business_id: customer.business_id,
        vat_registered: customer.vat_registered,
        annual_revenue_cents: customer.annual_revenue_cents,
        applicant_can_sign: customer.applicant_can_sign,
        beneficial_owners_json:
          customer.beneficial_owners === undefined
            ? null
            : JSON.stringify(customer.beneficial_owners),
      };
  }
}

/** Every customer, sorted by name (the order the actor picker shows them in). */
export async function listCustomers(db: PrismaClient | TransactionClient): Promise<Customer[]> {
  const rows = await db.customer.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  return rows.map(toCustomer);
}

/** One customer, or null when there is no customer with that id. */
export async function getCustomer(
  db: PrismaClient | TransactionClient,
  id: string
): Promise<Customer | null> {
  const row = await db.customer.findUnique({ where: { id } });
  return row ? toCustomer(row) : null;
}

/** Inserts customers that are not in the database yet. Never overwrites changes you made. */
export async function seedCustomers(
  db: PrismaClient,
  customers: readonly Customer[]
): Promise<{ created: number; skipped: number }> {
  const existing = await db.customer.findMany({ select: { id: true } });
  const existingIds = new Set(existing.map((row) => row.id));
  const missing = customers.filter((customer) => !existingIds.has(customer.id));
  if (missing.length > 0) {
    await db.customer.createMany({ data: missing.map(toCustomerRowData) });
  }
  return { created: missing.length, skipped: customers.length - missing.length };
}
