// Puts the app into a state that shows every flow at once: a case waiting for review, a held
// item, a contract crossing the VAT change and so on. Run by `npm run db:demo`, never by a
// plain seed. Everything goes through the same services as the API, so the invoices, audit
// rows and statuses are real, and a state that does not come out as expected stops the run.
import type { Answers, Application, ApplicationDecision } from '@/data/lease-schemas';
import { loadCustomers, loadSignatories } from '@/data/load';
import type { Customer, Signatory } from '@/data/schemas';
import type { PrismaClient } from '@/generated/prisma/client';
import { submitApplication } from '../application/applications';
import { SYSTEM_ACTOR, withAudit } from '../audit';
import { signContract } from '../contract/contracts';
import { setDemoDate } from '../date/app-date';
import { relistAsset } from '../second-life/relist';

/** The date the demo ends on, and the date the app then runs on. */
export const DEMO_DATE = '2026-11-05';
/** Prices start on 1 Jan 2026, so this 12-month lease is the first that can reach its end. */
const FIRST_LEASE_DATE = '2026-01-02';
/** Early enough for a contract to show invoices on both sides of the VAT change. */
const VAT_LEASE_DATE = '2026-09-15';

/** What the scenario cards need, so the demo must never touch these. */
export const CARD_ITEMS = [
  'ebike-001',
  'ebike-003',
  'ebike-004',
  'ebike-007',
  'ebike-008',
  'laptop-001',
  'laptop-004',
  'laptop-008',
  'farm-002',
] as const;

/** Who to log in as to see each state. Printed after a run, and listed in DEMO.md. */
export const DEMO_GUIDE = [
  { state: 'Rejected, too young', login: 'Mikko', item: 'laptop-005' },
  { state: 'Rejected, cannot afford it', login: 'Sanna', item: 'farm-008' },
  { state: 'Rejected, wrong business ID', login: 'the broken ID company', item: 'laptop-009' },
  { state: 'Waiting for manual review', login: 'Admin (or Haapala)', item: 'farm-003' },
  { state: 'Approved, ready to sign', login: 'Lena', item: 'ebike-006' },
  { state: 'Waiting for a company signature', login: 'Anna Norvi', item: 'laptop-010' },
  { state: 'Signed, crosses the VAT change', login: 'Pekka', item: 'ebike-005' },
  { state: 'Held for someone', login: 'Jonas Lind (or Dealer)', item: 'ebike-002' },
  { state: 'Re-listed used item', login: 'Anyone', item: 'ebike-011' },
  { state: 'End-of-term choice', login: 'Olavi, on 1 Jan 2027', item: 'laptop-002' },
] as const;

function companyAnswers(
  customer: Extract<Customer, { type: 'company' }>,
  signatories: readonly Signatory[]
): Answers {
  const signatory = signatories.find(({ company_id }) => company_id === customer.id);

  return {
    q_company_name: customer.name,
    q_business_id: customer.business_id,
    q_can_sign: customer.applicant_can_sign ? 'yes' : 'no',
    q_vat_registered: customer.vat_registered ? 'yes' : 'no',
    q_annual_revenue: customer.annual_revenue_cents,
    ...(signatory ? { q_signatory_email: signatory.email } : {}),
    ...(customer.beneficial_owners ? { q_beneficial_owners: customer.beneficial_owners } : {}),
  };
}

/** Everything the form could ask this customer. Answers that do not apply are dropped. */
function answersFor(customer: Customer, signatories: readonly Signatory[]): Answers {
  const shared = {
    q_customer_type: customer.type,
    q_email: customer.email,
    q_usage_purpose: 'commuting',
    q_farm_registry: 'FR-12345',
    q_pep: customer.is_pep ? 'yes' : 'no',
    ...(customer.is_pep ? { q_pep_details: 'One owner holds a public office.' } : {}),
  };
  switch (customer.type) {
    case 'company':
      return { ...shared, ...companyAnswers(customer, signatories) };
    case 'sole_trader':
      return {
        ...shared,
        q_full_name: customer.name,
        q_birth_date: customer.birth_date,
        q_country: customer.country,
        q_business_id: customer.business_id,
        q_vat_registered: customer.vat_registered ? 'yes' : 'no',
      };
    case 'consumer':
      return {
        ...shared,
        q_full_name: customer.name,
        q_birth_date: customer.birth_date,
        q_country: customer.country,
        q_employment: customer.employment,
        q_monthly_income: customer.monthly_net_income_cents,
      };
  }
}

export async function seedDemoScenario(db: PrismaClient): Promise<void> {
  if ((await db.application.count()) > 0) {
    throw new Error('The demo needs an empty database. Run `npm run db:demo`, which resets it.');
  }

  const [customers, signatories] = await Promise.all([loadCustomers(), loadSignatories()]);

  const customerWith = (id: string): Customer => {
    const found = customers.find((customer) => customer.id === id);
    if (!found) throw new Error(`The demo needs a customer "${id}"`);
    return found;
  };

  const setDate = (date: string) => setDemoDate(db, { date, actor: SYSTEM_ACTOR });

  async function apply(
    customerId: string,
    assetId: string,
    expected: ApplicationDecision,
    termMonths = 36
  ): Promise<Application> {
    const customer = customerWith(customerId);
    const result = await submitApplication(db, {
      customer,
      assetId,
      termMonths,
      downPaymentCents: 0,
      answers: answersFor(customer, signatories),
    });
    if (!result.ok) throw new Error(`${customerId} on ${assetId}: ${result.reason}`);
    if (result.application.decision !== expected) {
      throw new Error(
        `${customerId} on ${assetId}: expected ${expected}, got ${result.application.decision}`
      );
    }
    return result.application;
  }

  async function lease(customerId: string, assetId: string, termMonths?: number) {
    const application = await apply(customerId, assetId, 'approved', termMonths);
    const result = await signContract(db, {
      applicationId: application.id,
      customer: customerWith(customerId),
    });
    if (!result.ok) throw new Error(`${customerId} signing ${assetId}: ${result.reason}`);
  }

  // Reaches its end on 1 Jan 2027, the same day as the VAT change.
  await setDate(FIRST_LEASE_DATE);
  await lease('cust-olavi', 'laptop-002', 12);

  await setDate(VAT_LEASE_DATE);
  await lease('cust-pekka', 'ebike-005');

  await setDate(DEMO_DATE);
  await apply('cust-mikko', 'laptop-005', 'rejected');
  await apply('cust-sanna', 'farm-008', 'rejected');
  await apply('cust-broken-id', 'laptop-009', 'rejected');
  await apply('cust-haapala', 'farm-003', 'manual_review');
  await apply('cust-lena', 'ebike-006', 'approved');
  await apply('cust-norvi', 'laptop-010', 'approved');

  const relisted = await relistAsset(db, {
    assetId: 'ebike-011',
    condition: 'good',
    usageValue: 22_100,
    actor: SYSTEM_ACTOR,
  });
  if (!relisted.ok) throw new Error(`ebike-011 could not be re-listed: ${relisted.reason}`);

  // A real pass-on needs a finished contract, which cannot exist yet on this date.
  await withAudit(
    db,
    {
      actor: SYSTEM_ACTOR,
      action: 'asset.held',
      entityType: 'asset',
      entityId: 'ebike-002',
      details: { held_for: 'cust-wait-02', demo: true },
    },
    (tx) => tx.asset.update({ where: { id: 'ebike-002' }, data: { reserved_for: 'cust-wait-02' } })
  );
}
