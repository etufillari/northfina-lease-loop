// Customer persistence. The data pack is the source for the starter customer
// profiles; runtime changes should go through audited application services.
import type { Customer as CustomerRow, PrismaClient } from '@/generated/prisma/client';
import { customerSchema, type Customer } from '@/data/schemas';

/** Database row → the validated customer shape used by the data pack. */
export function toCustomer(row: CustomerRow): Customer {
  const base = {
    id: row.id,
    name: row.name,
    country: row.country,
    city: row.city,
    email: row.email,
    is_pep: row.is_pep,
    story: row.story,
  };

  if (row.type === 'consumer') {
    return customerSchema.parse({
      ...base,
      type: 'consumer',
      birth_date: row.birth_date,
      employment: row.employment,
      monthly_net_income_cents: row.monthly_net_income_cents,
    });
  }

  if (row.type === 'sole_trader') {
    return customerSchema.parse({
      ...base,
      type: 'sole_trader',
      business_id: row.business_id,
      birth_date: row.birth_date,
      vat_registered: row.vat_registered,
    });
  }

  return customerSchema.parse({
    ...base,
    type: 'company',
    business_id: row.business_id,
    vat_registered: row.vat_registered,
    annual_revenue_cents: row.annual_revenue_cents,
    applicant_can_sign: row.applicant_can_sign,
    beneficial_owners:
      row.beneficial_owners_json === null ? undefined : JSON.parse(row.beneficial_owners_json),
  });
}

/** Data-pack shape → columns for a customer row. */
export function toCustomerRowData(customer: Customer) {
  return {
    id: customer.id,
    type: customer.type,
    name: customer.name,
    country: customer.country,
    city: customer.city,
    email: customer.email,
    is_pep: customer.is_pep,
    birth_date: 'birth_date' in customer ? customer.birth_date : null,
    employment: 'employment' in customer ? customer.employment : null,
    monthly_net_income_cents:
      'monthly_net_income_cents' in customer ? customer.monthly_net_income_cents : null,
    business_id: 'business_id' in customer ? customer.business_id : null,
    vat_registered: 'vat_registered' in customer ? customer.vat_registered : null,
    annual_revenue_cents: 'annual_revenue_cents' in customer ? customer.annual_revenue_cents : null,
    applicant_can_sign: 'applicant_can_sign' in customer ? customer.applicant_can_sign : null,
    beneficial_owners_json:
      'beneficial_owners' in customer && customer.beneficial_owners
        ? JSON.stringify(customer.beneficial_owners)
        : null,
    story: customer.story,
  };
}

export async function listCustomers(db: PrismaClient): Promise<Customer[]> {
  const rows = await db.customer.findMany({ orderBy: { id: 'asc' } });
  return rows.map(toCustomer);
}

export async function getCustomer(db: PrismaClient, id: string): Promise<Customer | null> {
  const row = await db.customer.findUnique({ where: { id } });
  return row ? toCustomer(row) : null;
}

/** Inserts missing data-pack customers without overwriting runtime changes. */
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
