// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import {
  ainoEbikeAnswers,
  haapalaFarmAnswers,
  norviEbikeAnswers,
} from '../../tests/helpers/applicants';
import { createTestDb } from '../../tests/helpers/test-db';
import { setDemoDate } from './app-date';
import {
  describeQuestions,
  getApplication,
  listApplications,
  reviewApplication,
  submitApplication,
  type ApplicationRequest,
} from './applications';
import { seedAssets } from './assets';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let customers: Customer[];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  customers = await loadCustomers();
  await seedAssets(db, await loadAssets());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.application.deleteMany();
  await db.appSetting.deleteMany();
  await setDemoDate(db, { date: '2026-11-05', actor: 'test' });
  await db.auditLog.deleteMany();
});

function customer(id: string): Customer {
  const found = customers.find((c) => c.id === id);
  if (!found) throw new Error(`no customer ${id}`);
  return found;
}

/** Aino leasing ebike-003 for 36 months with nothing down: card 1. */
const card1 = (overrides: Partial<ApplicationRequest> = {}): ApplicationRequest => ({
  customer: customer('cust-aino'),
  assetId: 'ebike-003',
  quantity: 1,
  termMonths: 36,
  downPaymentCents: 0,
  answers: ainoEbikeAnswers,
  ...overrides,
});

/** Haapalan Tila leasing farm-002 for 48 months with 20 000 down: card 7. */
const card7 = (overrides: Partial<ApplicationRequest> = {}): ApplicationRequest => ({
  customer: customer('cust-haapala'),
  assetId: 'farm-002',
  quantity: 1,
  termMonths: 48,
  downPaymentCents: 2_000_000,
  answers: haapalaFarmAnswers,
  ...overrides,
});

async function submitOk(request: ApplicationRequest) {
  const result = await submitApplication(db, request);
  if (!result.ok) throw new Error(`expected a saved application, got ${result.reason}`);
  return result.application;
}

describe('submitApplication: approved (card 1)', () => {
  it('approves Aino and records the deal on the server date', async () => {
    expect(await submitOk(card1())).toMatchObject({
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
      decision: 'approved',
      reasons: [],
      reviewed_by: null,
      eligible_from: null,
    });
  });

  it('prices on the server date, so moving the date moves the price', async () => {
    await setDemoDate(db, { date: '2026-11-06', actor: 'test' });
    expect(await submitOk(card1())).toMatchObject({
      quote_date: '2026-11-06',
      price_list_version: 2,
      base_price_cents: 408_400,
    });
  });

  it('writes one audit row in the same step', async () => {
    const application = await submitOk(card1());
    const rows = await db.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: 'cust-aino',
      action: 'application.submitted',
      entity_type: 'application',
      entity_id: application.id,
    });
    expect(JSON.parse(rows[0]?.details_json ?? '')).toMatchObject({ decision: 'approved' });
  });

  it('saves the answers that count, and the customer type from the record, not the request', async () => {
    const application = await submitOk(
      card1({ answers: { ...ainoEbikeAnswers, q_customer_type: 'company' } })
    );
    expect(application.answers).toEqual({ ...ainoEbikeAnswers, q_customer_type: 'consumer' });
  });

  it('ignores an answer to a question that was not asked, so it cannot change the outcome', async () => {
    // q_pep only appears from 1 000 000 financed; at 389 000 it is not part of the deal.
    const application = await submitOk(
      card1({ answers: { ...ainoEbikeAnswers, q_pep: 'yes', q_pep_details: 'minister' } })
    );
    expect(application.decision).toBe('approved');
    expect(application.answers).not.toHaveProperty('q_pep');
  });

  it('prices several units together (card 6) and approves Norvi, who cannot sign yet', async () => {
    const application = await submitOk({
      customer: customer('cust-norvi'),
      assetId: 'ebike-004',
      quantity: 4,
      termMonths: 36,
      downPaymentCents: 0,
      answers: norviEbikeAnswers,
    });
    expect(application).toMatchObject({
      quantity: 4,
      base_price_cents: 2_196_000,
      financed_cents: 2_196_000,
      decision: 'approved',
    });
  });
});

describe('submitApplication: rejected', () => {
  it('rejects Mikko as too young and says when he can apply (card 5)', async () => {
    const application = await submitOk({
      customer: customer('cust-mikko'),
      assetId: 'laptop-008',
      quantity: 1,
      termMonths: 36,
      downPaymentCents: 0,
      answers: { q_birth_date: '2009-03-10' },
    });
    expect(application).toMatchObject({
      decision: 'rejected',
      reasons: ['min_age'],
      eligible_from: '2027-03-10',
    });
  });

  it('lets the same applicant through once the server date reaches the birthday', async () => {
    await setDemoDate(db, { date: '2027-03-10', actor: 'test' });
    const result = await submitApplication(db, {
      customer: customer('cust-mikko'),
      assetId: 'laptop-008',
      quantity: 1,
      termMonths: 36,
      downPaymentCents: 0,
      answers: { q_birth_date: '2009-03-10' },
    });
    expect(result).toMatchObject({ ok: false, reason: 'answers_missing' });
  });

  it('rejects a country outside FI, SE and EE without asking for the rest', async () => {
    const application = await submitOk(card1({ answers: { q_country: 'other' } }));
    expect(application).toMatchObject({ decision: 'rejected', reasons: ['residency'] });
  });

  it('rejects the broken business ID', async () => {
    const application = await submitOk({
      customer: customer('cust-broken-id'),
      assetId: 'laptop-001',
      quantity: 1,
      termMonths: 24,
      downPaymentCents: 0,
      answers: {
        q_email: 'typo@example.com',
        q_business_id: '1234567-8',
        q_company_name: 'Typo Trading Oy',
        q_can_sign: 'yes',
        q_vat_registered: 'no',
      },
    });
    expect(application).toMatchObject({ decision: 'rejected', reasons: ['business_id'] });
  });

  it('rejects Sanna for rent above 30 % of her income (12 months, v2 cargo e-bike)', async () => {
    await setDemoDate(db, { date: '2026-11-06', actor: 'test' });
    const answers = {
      q_full_name: 'Sanna Mäkelä',
      q_birth_date: '2004-11-02',
      q_email: 'sanna@example.com',
      q_country: 'FI',
      q_employment: 'student',
      q_monthly_income: 90_000,
      q_usage_purpose: 'commuting',
    };
    const base = { customer: customer('cust-sanna'), assetId: 'ebike-004', quantity: 1 };
    const twelve = await submitOk({ ...base, termMonths: 12, downPaymentCents: 0, answers });
    expect(twelve).toMatchObject({ decision: 'rejected', reasons: ['affordability'] });
    const twentyFour = await submitOk({ ...base, termMonths: 24, downPaymentCents: 0, answers });
    expect(twentyFour.decision).toBe('approved');
  });

  it('saves a deal outside the financing limits as a rejection, with its price (farm-006)', async () => {
    const application = await submitOk(card1({ assetId: 'farm-006', answers: {} }));
    expect(application).toMatchObject({
      decision: 'rejected',
      reasons: ['financed_limits'],
      base_price_cents: 26_000_000,
      financed_cents: 26_000_000,
      price_list_version: 1,
    });
  });

  it('saves a too-cheap deal as a rejection too (ebike-010 on price list 1)', async () => {
    const application = await submitOk(card1({ assetId: 'ebike-010', answers: {} }));
    expect(application).toMatchObject({
      decision: 'rejected',
      reasons: ['financed_limits'],
      financed_cents: 28_900,
    });
  });
});

describe('submitApplication: manual review (card 7)', () => {
  it('sends Haapalan Tila to a person even though they answered no to the PEP question', async () => {
    expect(await submitOk(card7())).toMatchObject({
      decision: 'manual_review',
      reasons: ['pep_manual_review'],
      financed_cents: 12_500_000,
    });
  });

  it('also does so when they answer yes, with details', async () => {
    const answers = {
      ...haapalaFarmAnswers,
      q_pep: 'yes',
      q_pep_details: 'Owner sits on a council',
    };
    expect((await submitOk(card7({ answers }))).decision).toBe('manual_review');
  });
});

describe('submitApplication: requests that are not saved', () => {
  async function savedCount() {
    return db.application.count();
  }

  it.each([
    ['an unknown asset', { assetId: 'nope' }, 'asset_not_found'],
    ['a reserved asset', { assetId: 'ebike-009' }, 'asset_not_available'],
    ['a returned asset', { assetId: 'ebike-007' }, 'asset_not_available'],
    ['a term that is not offered', { termMonths: 18 }, 'unknown_term'],
    ['a down payment above the price', { downPaymentCents: 389_001 }, 'down_payment_too_high'],
  ])('refuses %s', async (_name, overrides, reason) => {
    expect(await submitApplication(db, card1(overrides))).toEqual({ ok: false, reason });
    expect(await savedCount()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('refuses a date before any price list exists', async () => {
    await setDemoDate(db, { date: '2025-12-31', actor: 'test' });
    expect(await submitApplication(db, card1())).toEqual({
      ok: false,
      reason: 'no_price_on_date',
    });
  });

  it('refuses answers of the wrong form and names them', async () => {
    const answers = { ...ainoEbikeAnswers, q_birth_date: '2026-02-30', q_email: 'nope' };
    const result = await submitApplication(db, card1({ answers }));
    expect(result).toMatchObject({ ok: false, reason: 'answers_invalid' });
    const ids = result.ok || !('errors' in result) ? [] : result.errors.map((e) => e.question_id);
    expect(ids.sort()).toEqual(['q_birth_date', 'q_email']);
    expect(await savedCount()).toBe(0);
  });

  it('refuses an incomplete form and says what is missing', async () => {
    const result = await submitApplication(db, card1({ answers: { q_full_name: 'Aino' } }));
    expect(result).toEqual({
      ok: false,
      reason: 'answers_missing',
      question_ids: [
        'q_birth_date',
        'q_email',
        'q_country',
        'q_employment',
        'q_monthly_income',
        'q_usage_purpose',
      ],
    });
    expect(await savedCount()).toBe(0);
  });
});

describe('describeQuestions', () => {
  it('shows a consumer the questions for the deal, without the server-filled type', async () => {
    const result = await describeQuestions(db, card1({ answers: {} }));
    if (!result.ok) throw new Error(result.reason);
    expect(result.questions.map((q) => q.id)).toEqual([
      'q_full_name',
      'q_birth_date',
      'q_email',
      'q_country',
      'q_employment',
      'q_monthly_income',
      'q_usage_purpose',
    ]);
    expect(result.unanswered).toEqual(result.questions.map((q) => q.id));
    expect(result.blocked).toBeNull();
  });

  it('drops an answer when a smaller deal makes its question unnecessary', async () => {
    const result = await describeQuestions(db, card1({ downPaymentCents: 250_000 }));
    if (!result.ok) throw new Error(result.reason);
    expect(result.dropped).toEqual(['q_monthly_income']);
    expect(result.questions.map((q) => q.id)).not.toContain('q_monthly_income');
  });

  it('shows the card 7 questions to a company, and asks about PEP status', async () => {
    const result = await describeQuestions(db, card7({ answers: {} }));
    if (!result.ok) throw new Error(result.reason);
    expect(result.questions.map((q) => q.id)).toEqual([
      'q_email',
      'q_business_id',
      'q_company_name',
      'q_can_sign',
      'q_vat_registered',
      'q_farm_registry',
      'q_annual_revenue',
      'q_beneficial_owners',
      'q_pep',
    ]);
  });

  it('adds the signatory question once the company says it cannot sign', async () => {
    const result = await describeQuestions(db, card7({ answers: { q_can_sign: 'no' } }));
    if (!result.ok) throw new Error(result.reason);
    expect(result.questions.map((q) => q.id)).toContain('q_signatory_email');
  });

  it('stops Mikko at his birth date and says when he can apply', async () => {
    const result = await describeQuestions(db, {
      customer: customer('cust-mikko'),
      assetId: 'laptop-008',
      quantity: 1,
      termMonths: 36,
      downPaymentCents: 0,
      answers: { q_birth_date: '2009-03-10' },
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.blocked).toEqual({ reason: 'min_age', eligible_from: '2027-03-10' });
  });

  it('stops a customer who lives outside the allowed countries', async () => {
    const result = await describeQuestions(db, card1({ answers: { q_country: 'other' } }));
    if (!result.ok) throw new Error(result.reason);
    expect(result.blocked).toEqual({ reason: 'residency', eligible_from: null });
  });

  it('reports answers of the wrong form', async () => {
    const result = await describeQuestions(db, card1({ answers: { q_email: 'nope' } }));
    if (!result.ok) throw new Error(result.reason);
    expect(result.invalid).toEqual([{ question_id: 'q_email', reason: 'not_an_email' }]);
  });

  it('still describes a deal outside the financing limits', async () => {
    const result = await describeQuestions(db, card1({ assetId: 'farm-006', answers: {} }));
    expect(result.ok).toBe(true);
  });

  it('fails for requests that are not a deal, and saves nothing', async () => {
    expect(await describeQuestions(db, card1({ assetId: 'nope' }))).toEqual({
      ok: false,
      reason: 'asset_not_found',
    });
    expect(await db.application.count()).toBe(0);
  });
});

describe('reading applications', () => {
  it('finds an application by id and lists them by decision', async () => {
    const approved = await submitOk(card1());
    const review = await submitOk(card7());

    expect(await getApplication(db, approved.id)).toMatchObject({ id: approved.id });
    expect(await getApplication(db, 'nope')).toBeNull();
    expect((await listApplications(db)).map((a) => a.id)).toEqual([approved.id, review.id]);
    expect((await listApplications(db, { decision: 'manual_review' })).map((a) => a.id)).toEqual([
      review.id,
    ]);
  });
});

describe('reviewApplication', () => {
  it('approves an application waiting for a person, and records who and when', async () => {
    const waiting = await submitOk(card7());
    await setDemoDate(db, { date: '2026-11-06', actor: 'test' });

    const result = await reviewApplication(db, {
      id: waiting.id,
      decision: 'approved',
      actor: 'staff-admin',
    });
    expect(result).toMatchObject({
      ok: true,
      application: {
        decision: 'approved',
        reasons: ['pep_manual_review'],
        reviewed_by: 'staff-admin',
        reviewed_on: '2026-11-06',
      },
    });
  });

  it('can reject, and audits the change', async () => {
    const waiting = await submitOk(card7());
    await db.auditLog.deleteMany();

    await reviewApplication(db, { id: waiting.id, decision: 'rejected', actor: 'staff-admin' });
    const [row] = await db.auditLog.findMany();
    expect(row).toMatchObject({ actor: 'staff-admin', action: 'application.reviewed' });
    expect(JSON.parse(row?.details_json ?? '')).toEqual({ from: 'manual_review', to: 'rejected' });
  });

  it('settles an application only once, and leaves no audit row for the second try', async () => {
    const waiting = await submitOk(card7());
    await reviewApplication(db, { id: waiting.id, decision: 'approved', actor: 'staff-admin' });
    const auditRows = await db.auditLog.count();

    const again = await reviewApplication(db, {
      id: waiting.id,
      decision: 'rejected',
      actor: 'staff-admin',
    });
    expect(again).toEqual({ ok: false, reason: 'not_in_review' });
    expect(await db.auditLog.count()).toBe(auditRows);
    expect((await getApplication(db, waiting.id))?.decision).toBe('approved');
  });

  it('does not review an application that was never in review', async () => {
    const approved = await submitOk(card1());
    expect(
      await reviewApplication(db, { id: approved.id, decision: 'rejected', actor: 'staff-admin' })
    ).toEqual({ ok: false, reason: 'not_in_review' });
  });

  it('reports an unknown application', async () => {
    expect(
      await reviewApplication(db, { id: 'nope', decision: 'approved', actor: 'staff-admin' })
    ).toEqual({ ok: false, reason: 'not_found' });
  });
});
