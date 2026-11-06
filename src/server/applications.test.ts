// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { forbidden } from '../../tests/helpers/authz';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { answersFromCustomer } from '@/domain/question-flow/answers';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import {
  createApplication,
  decideApplication,
  flowSetupFor,
  getApplication,
  listApplications,
} from './applications';
import { seedAssets } from './assets';
import { seedCustomers } from './customers';
import type { PrismaClient } from './prisma-client';
import { decideByToken, seedSignatories } from './signatories';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let customers: Customer[];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  customers = await loadCustomers();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedAssets(db, await loadAssets());
  await seedCustomers(db, customers);
});

const TODAY = '2026-11-05';
const answersOf = (id: string) => answersFromCustomer(customers.find((c) => c.id === id)!);

type QuoteRow = { asset: string; financed: number; term: number; net: number };

/** The quote rows the pricing slice would write; the numbers are the pinned card numbers.
 * The fixture writes the row; the code under test reads it only through pricing's `getQuote`. */
async function insertQuote({ asset, financed, term, net }: QuoteRow) {
  const row = await db.quote.create({
    data: {
      asset_id: asset,
      quantity: 1,
      quote_date: TODAY,
      valid_until: '2026-12-05',
      price_list_version: 1,
      list_price_cents: financed,
      down_payment_cents: 0,
      financed_cents: financed,
      band: 'B',
      factor_millionths: 27_584,
      term_months: term,
      monthly_net_cents: net,
      buyout_cents: 0,
      vat_rate_bp_at_quote: 2_550,
    },
  });
  return row.id;
}

const card1 = () => insertQuote({ asset: 'ebike-003', financed: 389_000, term: 36, net: 10_730 });
const card5 = () => insertQuote({ asset: 'laptop-008', financed: 289_000, term: 36, net: 7_972 });
const card6 = () => insertQuote({ asset: 'ebike-004', financed: 549_000, term: 36, net: 15_144 });
const card7 = () =>
  insertQuote({ asset: 'farm-002', financed: 12_500_000, term: 48, net: 272_038 });

async function apply(quoteId: string, customerId: string, answers = answersOf(customerId)) {
  return createApplication(db, { quoteId, customerId, answers, today: TODAY, actor: customerId });
}

describe('flowSetupFor', () => {
  it('reads the frozen quote numbers through the pricing slice (one owner per table)', async () => {
    const found = await flowSetupFor(db, await card6(), 'cust-norvi');
    expect(found).toMatchObject({
      ok: true,
      setup: {
        context: { category: 'e_bike', financedCents: 549_000, termMonths: 36 },
        quoteDate: '2026-11-05',
        quoteValidUntil: '2026-12-05',
      },
      quote: { monthlyNetCents: 15_144, vatRateBp: 2_550 },
    });
  });
});

describe('createApplication', () => {
  it('card 1: Aino is approved, and the audit row is written with it', async () => {
    const result = await apply(await card1(), 'cust-aino');
    expect(result).toMatchObject({
      ok: true,
      application: { decision: 'approved', decidedOn: TODAY, customerId: 'cust-aino' },
    });
    if (!result.ok) return;
    const audit = await db.auditLog.findMany();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'application.created',
      entity_id: result.application.id,
      actor: 'cust-aino',
    });
  });

  it('card 5: Mikko is rejected with too_young and the day he turns 18', async () => {
    const result = await apply(await card5(), 'cust-mikko');
    expect(result.ok && result.application).toMatchObject({
      decision: 'rejected',
      reasons: [{ code: 'too_young', params: { eighteenOn: '2027-03-10' } }],
    });
  });

  it('card 6: Norvi ends in awaiting_signatory', async () => {
    const result = await apply(await card6(), 'cust-norvi');
    expect(result.ok && result.application.decision).toBe('awaiting_signatory');
  });

  it('card 7: Haapala goes to manual review with pep', async () => {
    const result = await apply(await card7(), 'cust-haapala');
    expect(result.ok && result.application).toMatchObject({
      decision: 'manual_review',
      reasons: [{ code: 'pep', params: {} }],
    });
  });

  it('the broken business id is rejected with invalid_business_id', async () => {
    const result = await apply(await card1(), 'cust-broken-id');
    expect(result.ok && result.application.reasons[0]?.code).toBe('invalid_business_id');
  });

  it('stores only the answers that apply (pruned)', async () => {
    const answers = { ...answersOf('cust-kettukoodi'), q_signatory_email: 'x@example.com' };
    const result = await apply(await card1(), 'cust-kettukoodi', answers);
    expect(result.ok && result.application.answers).not.toHaveProperty('q_signatory_email');
  });

  it('refuses an incomplete flow and names the first missing question', async () => {
    const { q_email: _dropped, ...answers } = answersOf('cust-aino');
    expect(await apply(await card1(), 'cust-aino', answers)).toEqual({
      ok: false,
      reason: 'incomplete_answers',
      questionId: 'q_email',
    });
    expect(await db.application.count()).toBe(0);
  });

  it('refuses an answer of the wrong shape', async () => {
    const answers = { ...answersOf('cust-aino'), q_country: 'Finland' };
    expect(await apply(await card1(), 'cust-aino', answers)).toMatchObject({
      ok: false,
      reason: 'invalid_answer',
      questionId: 'q_country',
    });
  });

  it('the trap: a birth date in the future is an invalid answer, not too_young', async () => {
    const answers = { ...answersOf('cust-mikko'), q_birth_date: '2030-01-01' };
    expect(await apply(await card5(), 'cust-mikko', answers)).toEqual({
      ok: false,
      reason: 'invalid_answer',
      questionId: 'q_birth_date',
      problem: {
        code: 'birth_date_out_of_range',
        params: { earliest: '1906-11-05', latest: TODAY },
      },
    });
    expect(await db.application.count()).toBe(0);
  });

  it('the trap: card 5 Mikko answering "company" goes to manual review, not approved', async () => {
    const answers = {
      q_customer_type: 'company',
      q_email: 'mikko.laine@example.com',
      q_business_id: '0737546-2',
      q_company_name: 'Mikko Oy',
      q_can_sign: 'yes',
      q_vat_registered: 'no',
    };
    const result = await apply(await card5(), 'cust-mikko', answers);
    expect(result.ok && result.application).toMatchObject({
      decision: 'manual_review',
      reasons: [{ code: 'answer_differs_from_record', params: { question: 'q_customer_type' } }],
    });
  });

  it('card 6: the applicant cannot name themself as the signatory', async () => {
    const answers = { ...answersOf('cust-norvi'), q_signatory_email: 'FLEET@norvi.example.com' };
    expect(await apply(await card6(), 'cust-norvi', answers)).toMatchObject({
      ok: false,
      reason: 'invalid_answer',
      questionId: 'q_signatory_email',
      problem: { code: 'signatory_is_applicant' },
    });
  });

  it('the trap: card 5 Mikko cannot apply in Aino’s name with her answers (D40)', async () => {
    const result = await createApplication(db, {
      quoteId: await card5(),
      customerId: 'cust-aino',
      answers: answersOf('cust-aino'),
      today: TODAY,
      actor: 'cust-mikko',
    });
    expect(result).toEqual(forbidden('not_owner', 'apply'));
    for (const [actor, expected] of [
      ['admin', { ok: false, reason: 'not_applicant' }],
      ['anonymous', forbidden('not_signed_in', 'apply')],
    ] as const) {
      const other = await createApplication(db, {
        quoteId: await card1(),
        customerId: 'cust-aino',
        answers: answersOf('cust-aino'),
        today: TODAY,
        actor,
      });
      expect(other, actor).toEqual(expected);
    }
    expect(await db.application.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('review finding 3: the applicant cannot name the record e-mail, though another was typed', async () => {
    const answers = {
      ...answersOf('cust-norvi'),
      q_email: 'fleet@norvi.example.com',
      q_signatory_email: ' Fleet@Norvi.example.com',
    };
    expect(await apply(await card6(), 'cust-norvi', answers)).toMatchObject({
      ok: false,
      reason: 'invalid_answer',
      problem: { code: 'signatory_is_applicant' },
    });
  });

  it.each([
    ['cust-norvi', 'q_can_sign', 'yes'],
    ['cust-aino', 'q_monthly_income', '900000'],
    ['cust-kettukoodi', 'q_annual_revenue', '999900000'],
    ['cust-aino', 'q_email', 'someone.else@example.com'],
  ])(
    'D38: %s answering %s other than the record is held for a person',
    async (id, question, value) => {
      // revenue is asked from 50 000 EUR financed: the farm machine of card 7
      const quote =
        id === 'cust-norvi'
          ? await card6()
          : question === 'q_annual_revenue'
            ? await card7()
            : await card1();
      const { q_signatory_email: _named, ...own } = answersOf(id);
      const answers = { ...(question === 'q_can_sign' ? own : answersOf(id)), [question]: value };
      const result = await apply(quote, id, answers);
      expect(result.ok && result.application).toMatchObject({
        decision: 'manual_review',
        reasons: [{ code: 'answer_differs_from_record', params: { question } }],
      });
    }
  );

  it('review finding 4: Aino on farm-002 typing a bigger income goes to manual review, not approved', async () => {
    const quoteId = await card7();
    const honest = await apply(quoteId, 'cust-aino');
    expect(honest.ok && honest.application.decision).toBe('rejected');
    const inflated = await apply(quoteId, 'cust-aino', {
      ...answersOf('cust-aino'),
      q_monthly_income: '5000000',
    });
    expect(inflated.ok && inflated.application.decision).not.toBe('approved');
    expect(inflated.ok && inflated.application.reasons).toContainEqual({
      code: 'answer_differs_from_record',
      params: { question: 'q_monthly_income' },
    });
  });

  it('D47: the admin applies for Aino with onBehalfOf, and the audit says so', async () => {
    const result = await createApplication(db, {
      quoteId: await card1(),
      customerId: 'cust-aino',
      answers: answersOf('cust-aino'),
      today: TODAY,
      actor: 'admin',
      onBehalfOf: 'cust-aino',
    });
    expect(result.ok && result.application).toMatchObject({
      customerId: 'cust-aino',
      decision: 'approved',
    });
    const [audit] = await db.auditLog.findMany();
    expect(audit?.actor).toBe('admin');
    expect(JSON.parse(audit?.details_json ?? '{}')).toMatchObject({ onBehalfOf: 'cust-aino' });
  });

  it('D47: onBehalfOf must name the customer, and a customer cannot use it', async () => {
    const quoteId = await card1();
    const base = {
      quoteId,
      customerId: 'cust-aino',
      answers: answersOf('cust-aino'),
      today: TODAY,
    };
    expect(
      await createApplication(db, { ...base, actor: 'admin', onBehalfOf: 'cust-mikko' })
    ).toEqual({ ok: false, reason: 'not_applicant' });
    expect(
      await createApplication(db, { ...base, actor: 'cust-mikko', onBehalfOf: 'cust-aino' })
    ).toEqual(forbidden('not_owner', 'apply'));
    expect(await db.application.count()).toBe(0);
  });

  it('a company on record outside FI, SE and EE is rejected on residency (review finding 12)', async () => {
    await db.customer.update({ where: { id: 'cust-norvi' }, data: { country: 'DE' } });
    const result = await apply(await card6(), 'cust-norvi');
    expect(result.ok && result.application).toMatchObject({
      decision: 'rejected',
      reasons: expect.arrayContaining([
        { code: 'residency_not_allowed', params: { country: 'DE' } },
      ]),
    });
  });

  it('unknown quote, unknown customer and an expired quote', async () => {
    expect(await apply('nope', 'cust-aino')).toEqual({ ok: false, reason: 'quote_not_found' });
    const quoteId = await card1();
    expect(await apply(quoteId, 'cust-nobody', {})).toEqual({
      ok: false,
      reason: 'customer_not_found',
    });
    const late = await createApplication(db, {
      quoteId,
      customerId: 'cust-aino',
      answers: answersOf('cust-aino'),
      today: '2026-12-06',
      actor: 'cust-aino',
    });
    expect(late).toEqual({ ok: false, reason: 'quote_expired' });
  });

  it('a day before the quote (the demo clock moved back) is quote_not_yet_valid (review finding 10)', async () => {
    const early = await createApplication(db, {
      quoteId: await card1(),
      customerId: 'cust-aino',
      answers: answersOf('cust-aino'),
      today: '2026-10-01',
      actor: 'cust-aino',
    });
    expect(early).toEqual({ ok: false, reason: 'quote_not_yet_valid' });
  });
});

describe('decideApplication (D10)', () => {
  const decide = (id: string, decision: 'approved' | 'rejected', actor = 'admin') =>
    decideApplication(db, { id, decision, reviewedBy: actor, today: '2026-11-06', actor });

  it('card 7: an admin approves the manual review; the reason and the reviewer are kept', async () => {
    const created = await apply(await card7(), 'cust-haapala');
    if (!created.ok) throw new Error('setup');
    const result = await decide(created.application.id, 'approved');
    expect(result.ok && result.application).toMatchObject({
      decision: 'approved',
      reviewedBy: 'admin',
      decidedOn: '2026-11-06',
      reasons: [
        { code: 'pep', params: {} },
        { code: 'reviewed', params: { by: 'admin', decision: 'approved', on: '2026-11-06' } },
      ],
    });
    expect(await db.auditLog.count({ where: { action: 'application.decided' } })).toBe(1);
  });

  it('only an admin decides a manual review', async () => {
    const created = await apply(await card7(), 'cust-haapala');
    if (!created.ok) throw new Error('setup');
    expect(await decide(created.application.id, 'approved', 'cust-haapala')).toEqual(
      forbidden('admin_only', 'decide_application')
    );
  });

  it('a PEP case that also needs a signatory waits for the signing link after the review', async () => {
    const answers = {
      ...answersOf('cust-haapala'),
      q_can_sign: 'no',
      q_signatory_email: 'jussi@haapala.example.com',
    };
    const created = await apply(await card7(), 'cust-haapala', answers);
    if (!created.ok) throw new Error('setup');
    expect(created.application.decision).toBe('manual_review');
    const result = await decide(created.application.id, 'approved');
    expect(result.ok && result.application.decision).toBe('awaiting_signatory');
    const request = await db.signatureRequest.findFirstOrThrow({
      where: { application_id: created.application.id },
      include: { signatory: true },
    });
    expect(request.signatory.email).toBe('jussi@haapala.example.com');
    const signed = await decideByToken(db, { token: request.token, action: 'sign', today: TODAY });
    expect(signed.ok && signed.application.decision).toBe('approved');
  });

  it('a decided application is final; an unknown id is not found', async () => {
    const created = await apply(await card1(), 'cust-aino');
    if (!created.ok) throw new Error('setup');
    expect(await decide(created.application.id, 'rejected')).toEqual({
      ok: false,
      reason: 'not_pending',
    });
    expect(await decide('nope', 'approved')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('two decisions at the same instant: exactly one wins, the other is not_pending and writes nothing', async () => {
    const created = await apply(await card7(), 'cust-haapala');
    if (!created.ok) throw new Error('setup');
    const id = created.application.id;
    const results = await Promise.all([decide(id, 'approved'), decide(id, 'rejected')]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: 'not_pending' });
    const winner = results.find((r) => r.ok);
    const stored = await getApplication(db, id);
    expect(stored?.decision).toBe(winner?.ok && winner.application.decision);
    expect(stored?.reasons.filter((r) => r.code === 'reviewed')).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: 'application.decided' } })).toBe(1);
  });
});

describe('getApplication', () => {
  it('returns the view or null', async () => {
    const created = await apply(await card1(), 'cust-aino');
    if (!created.ok) throw new Error('setup');
    expect(await getApplication(db, created.application.id)).toEqual(created.application);
    expect(await getApplication(db, 'nope')).toBeNull();
  });
});

describe('the signing link (D39, D46), card 6', () => {
  beforeEach(async () => {
    await seedSignatories(db, customers, TODAY);
  });

  async function norviWaits() {
    const created = await apply(await card6(), 'cust-norvi');
    if (!created.ok) throw new Error('setup');
    const request = await db.signatureRequest.findFirstOrThrow({
      where: { application_id: created.application.id },
      include: { signatory: true },
    });
    return { id: created.application.id, request };
  }

  it('card 6: Norvi waits, and a link goes to the named signatory, not yet in force', async () => {
    const { id, request } = await norviWaits();
    expect((await getApplication(db, id))?.decision).toBe('awaiting_signatory');
    expect(request).toMatchObject({
      sent_on: TODAY,
      expires_on: '2026-11-19',
      signed_on: null,
      signatory: {
        customer_id: 'cust-norvi',
        email: 'signatory@norvi.example.com',
        granted_by: 'register_check_simulated',
        valid_from: null,
      },
    });
    expect(request.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const [audit] = await db.auditLog.findMany();
    expect(JSON.parse(audit?.details_json ?? '{}')).toMatchObject({
      signingLinkTo: 'signatory@norvi.example.com',
    });
  });

  it('card 6: signing through the link approves, registers the signatory and names them in the audit', async () => {
    const { id, request } = await norviWaits();
    const result = await decideByToken(db, {
      token: request.token,
      action: 'sign',
      today: '2026-11-06',
    });
    expect(result).toMatchObject({ ok: true, registered: true });
    expect(result.ok && result.application).toMatchObject({
      decision: 'approved',
      reviewedBy: 'signatory@norvi.example.com',
      decidedOn: '2026-11-06',
    });
    expect(result.ok && result.application.reasons.at(-1)).toEqual({
      code: 'signatory_decided',
      params: { by: 'signatory@norvi.example.com', decision: 'approved', on: '2026-11-06' },
    });
    const signatory = await db.companySignatory.findUniqueOrThrow({
      where: { id: request.signatory_id },
    });
    expect(signatory.valid_from).toBe('2026-11-06');
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'application.decided', entity_id: id },
    });
    expect(audit.actor).toBe('signatory:signatory@norvi.example.com');
    expect(JSON.parse(audit.details_json ?? '{}')).toMatchObject({
      via: 'signing_link',
      signatoryRegistered: true,
    });
  });

  it('review finding 1: the company account posting a decision gets signatory_required; the admin too', async () => {
    const { id } = await norviWaits();
    for (const actor of ['cust-norvi', 'admin']) {
      const result = await decideApplication(db, {
        id,
        decision: 'approved',
        reviewedBy: 'signatory@norvi.example.com',
        today: TODAY,
        actor,
      });
      expect(result, actor).toEqual(forbidden('signatory_required', 'decide_application'));
    }
    expect((await getApplication(db, id))?.decision).toBe('awaiting_signatory');
    expect(await db.auditLog.count({ where: { action: 'application.decided' } })).toBe(0);
  });

  it('the trap: a second use of the link answers already_used and writes nothing', async () => {
    const { request } = await norviWaits();
    await decideByToken(db, { token: request.token, action: 'sign', today: TODAY });
    const again = await decideByToken(db, {
      token: request.token,
      action: 'decline',
      today: TODAY,
    });
    expect(again).toEqual({ ok: false, reason: 'already_used' });
    expect(await db.auditLog.count({ where: { action: 'application.decided' } })).toBe(1);
  });

  it('two uses at the same instant: exactly one wins', async () => {
    const { id, request } = await norviWaits();
    const results = await Promise.all([
      decideByToken(db, { token: request.token, action: 'sign', today: TODAY }),
      decideByToken(db, { token: request.token, action: 'decline', today: TODAY }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: 'already_used' });
    expect(
      await db.auditLog.count({ where: { action: 'application.decided', entity_id: id } })
    ).toBe(1);
  });

  it('declining rejects the case with the signatory’s reason', async () => {
    const { request } = await norviWaits();
    const result = await decideByToken(db, {
      token: request.token,
      action: 'decline',
      today: TODAY,
    });
    expect(result.ok && result.application).toMatchObject({ decision: 'rejected' });
    expect(result.ok && result.application.reasons.at(-1)).toEqual({
      code: 'signatory_decided',
      params: { by: 'signatory@norvi.example.com', decision: 'rejected', on: TODAY },
    });
    const signatory = await db.companySignatory.findUniqueOrThrow({
      where: { id: request.signatory_id },
    });
    // declining is still the signatory acting: the link identified them
    expect(signatory.valid_from).toBe(TODAY);
  });

  it('an expired link and an unknown token sign nothing', async () => {
    const { id, request } = await norviWaits();
    expect(
      await decideByToken(db, { token: request.token, action: 'sign', today: '2026-11-19' })
    ).toEqual({ ok: false, reason: 'expired' });
    expect(
      await decideByToken(db, { token: 'x'.repeat(32), action: 'sign', today: TODAY })
    ).toEqual({ ok: false, reason: 'not_found' });
    expect((await getApplication(db, id))?.decision).toBe('awaiting_signatory');
  });
});

describe('listApplications', () => {
  it('gives one customer their own applications, newest first, and admin all (My leases)', async () => {
    const aino = await apply(await card1(), 'cust-aino');
    const mikko = await apply(await card5(), 'cust-mikko');
    const ainoAgain = await apply(await card1(), 'cust-aino');
    if (!aino.ok || !mikko.ok || !ainoAgain.ok) throw new Error('application refused');

    expect((await listApplications(db, { customerId: 'cust-aino' })).map((a) => a.id)).toEqual([
      ainoAgain.application.id,
      aino.application.id,
    ]);
    expect((await listApplications(db, { customerId: 'cust-mikko' })).map((a) => a.id)).toEqual([
      mikko.application.id,
    ]);
    expect(await listApplications(db, { customerId: 'cust-nobody' })).toEqual([]);
    expect(await listApplications(db, {})).toHaveLength(3);
  });
});
