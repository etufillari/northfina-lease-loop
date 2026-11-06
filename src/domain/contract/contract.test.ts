import { beforeAll, describe, expect, it } from 'vitest';
import { contractSchema, type Application, type Quote } from '@/data/lease-schemas';
import { loadCoefficientTable, loadCustomers } from '@/data/load';
import type { Asset, CoefficientTable, Customer } from '@/data/schemas';
import { buildContract, lockedQuote, openLife, signingProblem } from './contract';

// Tests run against the real data pack, so they also catch a changed file.
let table: CoefficientTable;
let customers: Customer[];
beforeAll(async () => {
  [table, customers] = await Promise.all([loadCoefficientTable(), loadCustomers()]);
});

function customer(id: string): Customer {
  const found = customers.find((c) => c.id === id);
  if (!found) throw new Error(`no customer ${id}`);
  return found;
}

/** Card 1: Aino, ebike-003, 36 months, nothing down. */
const application = (overrides: Partial<Application> = {}): Application => ({
  id: 'app-1',
  customer_id: 'cust-aino',
  asset_id: 'ebike-003',
  quantity: 1,
  quote_date: '2026-11-05',
  start_on: '2026-11-05',
  price_list_version: 1,
  base_price_cents: 389_000,
  down_payment_cents: 0,
  financed_cents: 389_000,
  term_months: 36,
  answers: {},
  decision: 'approved',
  reasons: [],
  reviewed_by: null,
  reviewed_on: null,
  ...overrides,
});

function locked(app: Application): Quote {
  const result = lockedQuote(table, app);
  if (!result.ok) throw new Error(`expected a quote, got ${result.reason}`);
  return result.quote;
}

const build = (app: Application, signedOn: string) => buildContract(app, locked(app), signedOn);

describe('signingProblem', () => {
  it('lets a customer sign their own approved application', () => {
    expect(signingProblem(application(), customer('cust-aino'))).toBeNull();
  });

  it("refuses someone else's application", () => {
    expect(signingProblem(application(), customer('cust-lena'))).toBe('not_owner');
  });

  it.each(['rejected', 'manual_review'] as const)('refuses a %s application', (decision) => {
    expect(signingProblem(application({ decision }), customer('cust-aino'))).toBe('not_approved');
  });

  it('checks the owner first, so a stranger learns nothing about the decision', () => {
    const app = application({ decision: 'rejected' });
    expect(signingProblem(app, customer('cust-lena'))).toBe('not_owner');
  });

  it('lets a company applicant sign when both sources allow it', () => {
    const app = application({ customer_id: 'cust-kettukoodi', answers: { q_can_sign: 'yes' } });
    expect(signingProblem(app, customer('cust-kettukoodi'))).toBeNull();
  });

  it('stops Norvi, whose record says the applicant cannot sign (card 6)', () => {
    const app = application({ customer_id: 'cust-norvi', answers: { q_can_sign: 'no' } });
    expect(signingProblem(app, customer('cust-norvi'))).toBe('signatory_required');
  });

  it('is not fooled by answering yes when the record says no', () => {
    const app = application({ customer_id: 'cust-norvi', answers: { q_can_sign: 'yes' } });
    expect(signingProblem(app, customer('cust-norvi'))).toBe('signatory_required');
  });

  it('stops an applicant who says they cannot sign, even if the record allows it', () => {
    const app = application({ customer_id: 'cust-kettukoodi', answers: { q_can_sign: 'no' } });
    expect(signingProblem(app, customer('cust-kettukoodi'))).toBe('signatory_required');
  });

  it('reports the decision before the signatory', () => {
    const app = application({ customer_id: 'cust-norvi', decision: 'rejected' });
    expect(signingProblem(app, customer('cust-norvi'))).toBe('not_approved');
  });
});

describe('lockedQuote', () => {
  it('reproduces card 1 from the application alone', () => {
    expect(locked(application())).toMatchObject({
      price_list_version: 1,
      base_price_cents: 389_000,
      band: 'B',
      factor_micros: 27_584,
      monthly_net_rent_cents: 10_730,
      buyout_cents: 58_350,
    });
  });

  it('keeps the quoted price of card 2, whatever the list says on signing day', () => {
    const card2 = application({
      asset_id: 'laptop-004',
      base_price_cents: 349_000,
      financed_cents: 349_000,
    });
    expect(locked(card2)).toMatchObject({
      price_list_version: 1,
      base_price_cents: 349_000,
      monthly_net_rent_cents: 9_627,
    });
  });

  it('prices a down payment and several units from the stored total', () => {
    const app = application({
      quantity: 4,
      base_price_cents: 2_196_000,
      down_payment_cents: 196_000,
      financed_cents: 2_000_000,
    });
    expect(locked(app)).toMatchObject({ financed_cents: 2_000_000, band: 'C' });
  });

  it('keeps a missing price list version for a re-listed item', () => {
    expect(locked(application({ price_list_version: null })).price_list_version).toBeNull();
  });

  it('passes on the reason if the stored deal cannot be priced', () => {
    const app = application({ base_price_cents: 100, financed_cents: 100 });
    expect(lockedQuote(table, app)).toEqual({ ok: false, reason: 'below_minimum' });
  });
});

describe('buildContract', () => {
  it('builds the contract for card 1', () => {
    expect(build(application(), '2026-11-05')).toEqual({
      application_id: 'app-1',
      customer_id: 'cust-aino',
      asset_id: 'ebike-003',
      quantity: 1,
      quote_date: '2026-11-05',
      signed_on: '2026-11-05',
      start_on: '2026-11-05',
      planned_end_on: '2029-11-04',
      actual_end_on: null,
      status: 'active',
      price_list_version: 1,
      base_price_cents: 389_000,
      down_payment_cents: 0,
      financed_cents: 389_000,
      term_months: 36,
      band: 'B',
      factor_micros: 27_584,
      annual_interest_basis_points: 790,
      monthly_net_rent_cents: 10_730,
      buyout_cents: 58_350,
    });
  });

  it('produces a record that matches the contract schema once it has an id', () => {
    const contract = { id: 'con-1', ...build(application(), '2026-11-05') };
    expect(contractSchema.safeParse(contract).success).toBe(true);
  });

  it('starts on the signing date when signing happens after the planned start (card 2)', () => {
    expect(build(application(), '2026-11-06')).toMatchObject({
      quote_date: '2026-11-05',
      signed_on: '2026-11-06',
      start_on: '2026-11-06',
      planned_end_on: '2029-11-05',
    });
  });

  it('keeps a planned start that is later than the signing date', () => {
    const app = application({ start_on: '2026-12-01' });
    expect(build(app, '2026-11-05')).toMatchObject({
      signed_on: '2026-11-05',
      start_on: '2026-12-01',
      planned_end_on: '2029-11-30',
    });
  });

  it('ends on the last day of a month for a start on the first', () => {
    const app = application({ start_on: '2026-02-01', term_months: 12 });
    expect(build(app, '2026-02-01').planned_end_on).toBe('2027-01-31');
  });

  it('handles a start on the last day of a month (card 4)', () => {
    const app = application({ start_on: '2026-01-31' });
    expect(build(app, '2026-01-31').planned_end_on).toBe('2029-01-30');
  });

  it('handles a term that ends in a short month', () => {
    const app = application({ start_on: '2026-01-31', term_months: 12 });
    expect(build(app, '2026-01-31').planned_end_on).toBe('2027-01-30');
    const leap = application({ start_on: '2027-02-28', term_months: 12 });
    expect(build(leap, '2027-02-28').planned_end_on).toBe('2028-02-27');
  });
});

describe('openLife', () => {
  const asset = (overrides: Partial<Asset> = {}): Asset => ({
    id: 'ebike-003',
    category: 'e_bike',
    make: 'Nordvolt',
    model: 'Trail 500',
    model_year: 2026,
    serial_number: 'SN-1',
    condition: 'new',
    usage: { unit: 'km', value: 0 },
    previous_lives: 0,
    status: 'available',
    ...overrides,
  });

  const contract = (overrides: Partial<Application> = {}) => ({
    id: 'con-1',
    ...build(application(overrides), '2026-11-05'),
  });

  it('opens the first life of a new item, with its price at first lease', () => {
    expect(openLife(contract(), asset(), null)).toEqual({
      asset_id: 'ebike-003',
      life_number: 1,
      contract_id: 'con-1',
      first_lease_price_cents: 389_000,
      started_on: '2026-11-05',
      ended_on: null,
      outcome: null,
      start_condition: 'new',
      start_usage_value: 0,
      end_condition: null,
      end_usage_value: null,
    });
  });

  it('records the price of one unit when several are leased', () => {
    const several = contract({
      quantity: 4,
      base_price_cents: 2_196_000,
      financed_cents: 2_196_000,
    });
    expect(openLife(several, asset(), null).first_lease_price_cents).toBe(549_000);
  });

  it('numbers on from the latest life and carries its price at first lease', () => {
    const latest = { life_number: 2, first_lease_price_cents: 389_000 };
    expect(openLife(contract(), asset({ previous_lives: 2 }), latest)).toMatchObject({
      life_number: 3,
      first_lease_price_cents: 389_000,
    });
  });

  it('numbers on from previous_lives when the app has no record of them', () => {
    const used = asset({ previous_lives: 2, condition: 'good', usage: { unit: 'km', value: 900 } });
    expect(openLife(contract(), used, null)).toMatchObject({
      life_number: 3,
      first_lease_price_cents: null,
      start_condition: 'good',
      start_usage_value: 900,
    });
  });

  it('keeps an unknown price at first lease unknown', () => {
    const latest = { life_number: 1, first_lease_price_cents: null };
    expect(openLife(contract(), asset(), latest).first_lease_price_cents).toBeNull();
  });
});
