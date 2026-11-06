// Who applies and who signs, on a real, migrated SQLite database (see tests/global-setup.ts):
// the edges of D39 and D40 that the domain tests cannot see, and the reason chain of a case
// that is held, reviewed and then signed. Nothing here knows a card; the numbers are the
// pricing slice's frozen quote rows for the pack's assets.
import { forbidden } from '../../tests/helpers/authz';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { answersFromCustomer } from '@/domain/question-flow/answers';
import { resetDb } from '../../tests/helpers/reset-db';
import { createTestDb } from '../../tests/helpers/test-db';
import { createApplication, decideApplication, getApplication } from './applications';
import { seedAssets } from './assets';
import { seedCustomers } from './customers';
import type { PrismaClient } from './prisma-client';
import { decideByToken } from './signatories';

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
const VALID_UNTIL = '2026-11-19';
const answersOf = (id: string) => answersFromCustomer(customers.find((c) => c.id === id)!);

/** A frozen quote row as the pricing slice writes it (card 6's one bike unless told otherwise). */
async function insertQuote(
  row: Partial<{
    asset: string;
    financed: number;
    band: string;
    factor: number;
    term: number;
    net: number;
  }> = {}
) {
  const {
    asset = 'ebike-004',
    financed = 549_000,
    band = 'B',
    factor = 27_584,
    term = 36,
    net = 15_144,
  } = row;
  const created = await db.quote.create({
    data: {
      asset_id: asset,
      quantity: 1,
      quote_date: TODAY,
      valid_until: VALID_UNTIL,
      price_list_version: 1,
      list_price_cents: financed,
      down_payment_cents: 0,
      financed_cents: financed,
      band,
      factor_millionths: factor,
      term_months: term,
      monthly_net_cents: net,
      buyout_cents: 0,
      vat_rate_bp_at_quote: 2_550,
    },
  });
  return created.id;
}

const card1 = () => insertQuote({ asset: 'ebike-003', financed: 389_000, net: 10_730 });
const card7 = () =>
  insertQuote({ asset: 'farm-002', financed: 12_500_000, term: 48, net: 272_038 });

const apply = (
  quoteId: string,
  customerId: string,
  answers = answersOf(customerId),
  overrides: Partial<{ today: string; actor: string }> = {}
) =>
  createApplication(db, {
    quoteId,
    customerId,
    answers,
    today: overrides.today ?? TODAY,
    actor: overrides.actor ?? customerId,
  });

const sign = (
  id: string,
  reviewedBy: string,
  actor: string,
  decision: 'approved' | 'rejected' = 'approved'
) => decideApplication(db, { id, decision, reviewedBy, today: TODAY, actor });

/** The signatory answers through the link sent for the case (D46): the only way to sign. */
async function byLink(applicationId: string, action: 'sign' | 'decline' = 'sign') {
  const request = await db.signatureRequest.findFirstOrThrow({
    where: { application_id: applicationId },
    orderBy: { sent_on: 'desc' },
  });
  return decideByToken(db, { token: request.token, action, today: TODAY });
}

const nothingWritten = async () => {
  expect(await db.application.count()).toBe(0);
  expect(await db.auditLog.count()).toBe(0);
};

describe('who applies (D40)', () => {
  it('the admin applying as "admin" without onBehalfOf is not the applicant, and writes nothing (D47)', async () => {
    // D73: there is no customer "admin", so the refusal comes before any rule of D47.
    expect(await apply(await card1(), 'admin', answersOf('cust-aino'), { actor: 'admin' })).toEqual(
      {
        ok: false,
        reason: 'customer_not_found',
      }
    );
    await nothingWritten();
  });

  it('the customer id is compared exactly: a space or a case change is another name', async () => {
    const quoteId = await card1();
    for (const customerId of [' cust-aino', 'cust-aino ', 'CUST-AINO']) {
      expect(
        await apply(quoteId, customerId, answersOf('cust-aino'), { actor: 'cust-aino' })
      ).toEqual({
        ok: false,
        reason: 'customer_not_found',
      });
    }
    await nothingWritten();
  });

  it('a quote is good on its last valid day and expired the day after', async () => {
    const quoteId = await card1();
    const onTheDay = await apply(quoteId, 'cust-aino', undefined, { today: VALID_UNTIL });
    expect(onTheDay.ok).toBe(true);
    expect(await apply(quoteId, 'cust-aino', undefined, { today: '2026-11-20' })).toEqual({
      ok: false,
      reason: 'quote_expired',
    });
  });

  it('a refused application leaves no row and no audit entry, whatever the refusal', async () => {
    const quoteId = await card1();
    await apply(quoteId, 'cust-aino', { ...answersOf('cust-aino'), q_country: 'Finland' });
    await apply(quoteId, 'cust-aino', { ...answersOf('cust-aino'), q_birth_date: '2027-01-01' });
    await apply('no-such-quote', 'cust-aino');
    await apply(quoteId, 'cust-aino', undefined, { today: '2027-01-01' });
    await nothingWritten();
  });

  it('quotes are anonymous: any customer applies on a quote in their own name, and their own rules apply', async () => {
    const quoteId = await card1();
    const olavi = await apply(quoteId, 'cust-olavi');
    expect(olavi.ok && olavi.application).toMatchObject({
      customerId: 'cust-olavi',
      decision: 'approved',
    });
  });
});

describe('one pending or approved application per quote', () => {
  const holds = async (quoteId: string, firstCustomer: string, decision: string) => {
    const first = await apply(quoteId, firstCustomer);
    if (!first.ok) throw new Error('setup');
    expect(first.application.decision).toBe(decision);
    return first.application.id;
  };

  it.each([
    ['approved', card1, 'cust-aino', 'cust-olavi'],
    ['manual_review', card7, 'cust-haapala', 'cust-haapala'],
    ['awaiting_signatory', () => insertQuote(), 'cust-norvi', 'cust-norvi'],
  ] as const)(
    'a %s application holds the quote: the next is quote_in_use and writes nothing',
    async (decision, quote, first, second) => {
      const quoteId = await quote();
      const applicationId = await holds(quoteId, first, decision);
      expect(await apply(quoteId, second)).toEqual({
        ok: false,
        reason: 'quote_in_use',
        applicationId,
      });
      expect(await db.application.count()).toBe(1);
      expect(await db.auditLog.count()).toBe(1);
    }
  );

  it('a rejected application does not hold it: the customer may correct the answers and apply again', async () => {
    const quoteId = await card1();
    const rejected = await apply(quoteId, 'cust-aino', {
      ...answersOf('cust-aino'),
      q_monthly_income: '1',
    });
    expect(rejected.ok && rejected.application.decision).toBe('rejected');
    const again = await apply(quoteId, 'cust-aino');
    expect(again.ok && again.application.decision).toBe('approved');
  });

  it('a manual review rejected by the admin frees the quote', async () => {
    const quoteId = await card7();
    const id = await holds(quoteId, 'cust-haapala', 'manual_review');
    const decided = await decideApplication(db, {
      id,
      decision: 'rejected',
      reviewedBy: 'admin',
      today: TODAY,
      actor: 'admin',
    });
    expect(decided.ok).toBe(true);
    expect((await apply(quoteId, 'cust-haapala')).ok).toBe(true);
  });
});

describe('the signatory (D39, D46)', () => {
  const SIGNATORY = 'signatory@norvi.example.com';

  it('declining is final: the signatory cannot sign afterwards, nor decline again', async () => {
    const created = await apply(await insertQuote(), 'cust-norvi');
    if (!created.ok) throw new Error('setup');
    const declined = await byLink(created.application.id, 'decline');
    expect(declined.ok && declined.application.decision).toBe('rejected');
    expect(await byLink(created.application.id)).toEqual({ ok: false, reason: 'already_used' });
    expect(await byLink(created.application.id, 'decline')).toEqual({
      ok: false,
      reason: 'already_used',
    });
    // D73: the coordinator is refused before the state is read.
    expect(await sign(created.application.id, SIGNATORY, 'cust-norvi')).toEqual(
      forbidden('admin_only', 'decide_application')
    );
    expect((await getApplication(db, created.application.id))?.decision).toBe('rejected');
  });

  it('signing twice: the second signature changes nothing and writes no second audit row', async () => {
    const created = await apply(await insertQuote(), 'cust-norvi');
    if (!created.ok) throw new Error('setup');
    expect((await byLink(created.application.id)).ok).toBe(true);
    expect(await byLink(created.application.id)).toEqual({ ok: false, reason: 'already_used' });
    expect(await db.auditLog.count({ where: { action: 'application.decided' } })).toBe(1);
    const stored = await getApplication(db, created.application.id);
    expect(stored?.reasons.filter((r) => r.code === 'signatory_decided')).toHaveLength(1);
  });

  it('the named e-mail in another case or with spaces around it is the same signatory', async () => {
    const first = await apply(await insertQuote(), 'cust-norvi');
    const second = await apply(await insertQuote(), 'cust-norvi', {
      ...answersOf('cust-norvi'),
      q_signatory_email: '  SIGNATORY@Norvi.example.com ',
    });
    if (!first.ok || !second.ok) throw new Error('setup');
    const signed = await byLink(second.application.id);
    expect(signed.ok && signed.application.decision).toBe('approved');
    expect(signed.ok && signed.application.reviewedBy).toBe(SIGNATORY); // stored trimmed, lower case
    const signatories = await db.companySignatory.findMany({
      where: { customer_id: 'cust-norvi' },
    });
    expect(signatories.map((row) => row.email)).toEqual([SIGNATORY]);
  });

  it('nobody signs on the decision page, not the company account, the admin or anonymous', async () => {
    const created = await apply(await insertQuote(), 'cust-norvi');
    if (!created.ok) throw new Error('setup');
    for (const actor of ['cust-norvi', 'admin']) {
      expect(await sign(created.application.id, SIGNATORY, actor), actor).toEqual(
        forbidden('signatory_required', 'decide_application')
      );
    }
  });

  it('anonymous cannot sign, even with the right e-mail', async () => {
    const created = await apply(await insertQuote(), 'cust-norvi');
    if (!created.ok) throw new Error('setup');
    expect(await sign(created.application.id, SIGNATORY, 'anonymous')).toEqual(
      forbidden('not_signed_in', 'decide_application')
    );
  });

  it('the trap: another q_email does not let the coordinator name their record e-mail as signatory', async () => {
    const answers = {
      ...answersOf('cust-norvi'),
      q_email: 'coordinator.private@example.net',
      q_signatory_email: 'FLEET@norvi.example.com',
    };
    expect(await apply(await insertQuote(), 'cust-norvi', answers)).toMatchObject({
      ok: false,
      reason: 'invalid_answer',
      questionId: 'q_signatory_email',
      problem: { code: 'signatory_is_applicant' },
    });
    await nothingWritten();
  });

  it('the trap: the coordinator who may not sign on record answers "yes" and is held, not approved', async () => {
    // the server prunes the signatory answer itself once "can sign" is yes
    const answers = { ...answersOf('cust-norvi'), q_can_sign: 'yes' };
    const created = await apply(await insertQuote(), 'cust-norvi', answers);
    expect(created.ok && created.application).toMatchObject({
      decision: 'manual_review',
      reasons: [{ code: 'answer_differs_from_record', params: { question: 'q_can_sign' } }],
    });
    if (!created.ok) throw new Error('setup');
    // the coordinator cannot "sign" the review away either
    expect(await sign(created.application.id, 'fleet@norvi.example.com', 'cust-norvi')).toEqual(
      forbidden('admin_only', 'decide_application')
    );
  });
});

describe('a case that is held, reviewed and signed keeps every reason in order', () => {
  it('card 7 with a signatory: pep, the differing answer, signatory_needed, reviewed, signatory_decided', async () => {
    const answers = {
      ...answersOf('cust-haapala'),
      q_can_sign: 'no',
      q_signatory_email: 'jussi@haapala.example.com',
    };
    const created = await apply(await card7(), 'cust-haapala', answers);
    if (!created.ok) throw new Error('setup');
    expect(created.application.reasons.map((r) => r.code)).toEqual([
      'pep',
      'answer_differs_from_record',
      'signatory_needed',
    ]);
    const reviewed = await decideApplication(db, {
      id: created.application.id,
      decision: 'approved',
      reviewedBy: 'admin',
      today: '2026-11-06',
      actor: 'admin',
    });
    expect(reviewed.ok && reviewed.application.decision).toBe('awaiting_signatory');
    const signed = await byLink(created.application.id);
    expect(signed.ok && signed.application.decision).toBe('approved');
    expect(signed.ok && signed.application.reasons.map((r) => r.code)).toEqual([
      'pep',
      'answer_differs_from_record',
      'signatory_needed',
      'reviewed',
      'signatory_decided',
    ]);
    expect(await db.auditLog.count({ where: { action: 'application.decided' } })).toBe(2);
  });
});
