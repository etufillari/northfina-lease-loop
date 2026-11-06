// Customers: seeded from data/customers.json, plus "new customer" rows created in the app.
// Profile data beyond name and email is filled in by the first application (and saved as
// defaults only when the customer opts in).
import type { Customer as DataCustomer } from '@/data/schemas';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { withAudit } from '@/server/audit';

type DbClient = PrismaClient;

export type CustomerRow = {
  id: string;
  type: string;
  name: string;
  country: string;
  city: string;
  email: string;
  is_pep: boolean;
  story: string | null;
  birth_date: string | null;
  employment: string | null;
  monthly_net_income_cents: number | null;
  business_id: string | null;
  vat_registered: boolean | null;
  annual_revenue_cents: number | null;
  applicant_can_sign: boolean | null;
  beneficial_owners_json: string | null;
  saved_defaults_json: string | null;
};

function toRowData(customer: DataCustomer) {
  return {
    id: customer.id,
    type: customer.type,
    name: customer.name,
    country: customer.country,
    city: customer.city,
    email: customer.email,
    is_pep: customer.is_pep,
    story: customer.story,
    birth_date: 'birth_date' in customer ? customer.birth_date : null,
    employment: customer.type === 'consumer' ? customer.employment : null,
    monthly_net_income_cents:
      customer.type === 'consumer' ? customer.monthly_net_income_cents : null,
    business_id: 'business_id' in customer ? customer.business_id : null,
    vat_registered: 'vat_registered' in customer ? customer.vat_registered : null,
    annual_revenue_cents: customer.type === 'company' ? customer.annual_revenue_cents : null,
    applicant_can_sign: customer.type === 'company' ? customer.applicant_can_sign : null,
    beneficial_owners_json:
      customer.type === 'company' && customer.beneficial_owners
        ? JSON.stringify(customer.beneficial_owners)
        : null,
  };
}

/** Adds data-pack customers that are missing; never overwrites app changes. */
export async function seedCustomers(
  db: DbClient | Prisma.TransactionClient,
  customers: readonly DataCustomer[]
) {
  let created = 0;
  for (const customer of customers) {
    const existing = await db.customer.findUnique({ where: { id: customer.id } });
    if (existing) continue;
    await db.customer.create({ data: toRowData(customer) });
    created++;
  }
  return { created, skipped: customers.length - created };
}

export function listCustomers(db: DbClient) {
  return db.customer.findMany({ orderBy: { name: 'asc' } });
}

export function getCustomer(db: DbClient, id: string) {
  return db.customer.findUnique({ where: { id } });
}

/** The "add an empty user" case: a person exists from the moment they have a name. */
export function createCustomer(
  db: DbClient,
  input: { name: string; email: string; type: string; actor: string }
) {
  const id = crypto.randomUUID();
  return withAudit(
    db,
    { actor: input.actor, action: 'customer.created', entityType: 'customer', entityId: id },
    (tx) =>
      tx.customer.create({
        data: { id, name: input.name, email: input.email, type: input.type, country: 'FI' },
      })
  );
}

/** Remembers which catalogue category the customer browses, so it opens there next time. */
export function savePreferredCategory(
  db: DbClient,
  input: { customerId: string; category: string; actor: string }
) {
  return withAudit(
    db,
    {
      actor: input.actor,
      action: 'customer.preferred_category_saved',
      entityType: 'customer',
      entityId: input.customerId,
      details: { category: input.category },
    },
    (tx) =>
      tx.customer.update({
        where: { id: input.customerId },
        data: { preferred_category: input.category },
      })
  );
}

/** Saves answers as prefill defaults — only on the customer's explicit opt-in. */
export function saveDefaults(
  db: DbClient,
  input: { customerId: string; defaults: Record<string, unknown>; actor: string }
) {
  return withAudit(
    db,
    {
      actor: input.actor,
      action: 'customer.defaults_saved',
      entityType: 'customer',
      entityId: input.customerId,
      details: { keys: Object.keys(input.defaults) },
    },
    (tx) =>
      tx.customer.update({
        where: { id: input.customerId },
        data: { saved_defaults_json: JSON.stringify(input.defaults) },
      })
  );
}
