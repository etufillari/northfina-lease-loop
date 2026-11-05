// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { quoteAndSign as quoteAndSignLease, type Lease } from '../../tests/helpers/quote-and-sign';
import { createTestDb } from '../../tests/helpers/test-db';
import { loadAssets } from '@/data/load';
import { listAuditLog } from './audit';
import { seedAssets } from './assets';
import { getContract, type LeaseDataPack } from './contracts';
import { loadLeaseDataPack } from './lease-data';
import { CorruptRowError } from './stored-row';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: LeaseDataPack;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  data = await loadLeaseDataPack();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.quote.deleteMany();
  await db.contract.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

const ainoAnswers = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino.virtanen@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 320_000,
  q_usage_purpose: 'commuting',
};
const aino = {
  assetId: 'ebike-003',
  customerId: 'cust-aino',
  termMonths: 36,
  downPaymentCents: 0,
  answers: ainoAnswers,
  today: '2026-11-05',
  actor: 'cust-aino',
};
// Card 5: Mikko's own record (data/customers.json), on laptop-008.
const mikko = {
  ...aino,
  assetId: 'laptop-008',
  customerId: 'cust-mikko',
  actor: 'cust-mikko',
  answers: {
    q_customer_type: 'consumer',
    q_full_name: 'Mikko Laine',
    q_birth_date: '2009-03-10',
    q_email: 'mikko.laine@example.com',
    q_country: 'FI',
    q_employment: 'student',
    q_monthly_income: 40_000,
  },
};
// Card 6: Norvi's own record; the applicant may not sign, so a signatory is named.
const norviAnswers = {
  q_customer_type: 'company',
  q_email: 'fleet@norvi.example.com',
  q_business_id: '3299871-7',
  q_company_name: 'Norvi Logistics Oy',
  q_can_sign: 'no',
  q_signatory_email: 'ceo@norvi.example.com',
  q_vat_registered: 'yes',
  q_usage_purpose: 'delivery',
};
const norvi = { ...aino, assetId: 'ebike-004', customerId: 'cust-norvi', answers: norviAnswers };

const quoteAndSign = (lease: Lease) => quoteAndSignLease(db, data, lease);

/** Audit rows other than the quotes made before signing. */
async function signingAudit() {
  return (await listAuditLog(db)).filter((entry) => entry.action !== 'quote.created');
}

describe('signLease', () => {
  it('prices on the server, stores the frozen contract and reserves the asset (card 1)', async () => {
    const result = await quoteAndSign(aino);
    expect(result).toMatchObject({
      ok: true,
      contract: {
        assetId: 'ebike-003',
        customerId: 'cust-aino',
        signDate: '2026-11-05',
        startDate: '2026-11-05',
        priceListVersion: 1,
        monthlyNetRentCents: 10_730, // 389 000 × 0.027584, DATA.md worked example
        billing: 'start_day_full_months',
      },
    });
    if (!result.ok) return;

    expect(await getContract(db, result.id)).toEqual({ id: result.id, contract: result.contract });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset.status).toBe('reserved');
  });

  it('writes one audit row naming the new contract, in the same transaction', async () => {
    const result = await quoteAndSign(aino);
    if (!result.ok) throw new Error(result.reason);
    const log = await signingAudit();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actor: 'cust-aino',
      action: 'contract.signed',
      entity_type: 'contract',
      entity_id: String(result.id),
      // asOf: the effective date it was signed on (D-030), the `today` passed in above.
      details: {
        assetId: 'ebike-003',
        monthlyNetRentCents: 10_730,
        priceListVersion: 1,
        asOf: '2026-11-05',
      },
    });
  });

  it('refuses an asset that is not available, and changes nothing', async () => {
    // ebike-009 is reserved in the data pack.
    expect(await quoteAndSign({ ...aino, assetId: 'ebike-009' })).toEqual({
      ok: false,
      reason: 'asset_not_available',
    });
    expect(await db.contract.count()).toBe(0);
    expect(await signingAudit()).toHaveLength(0);
  });

  it('cannot lease the same item twice', async () => {
    expect((await quoteAndSign(aino)).ok).toBe(true);
    expect(await quoteAndSign({ ...aino, customerId: 'cust-sanna' })).toEqual({
      ok: false,
      reason: 'asset_not_available',
    });
    expect(await db.contract.count()).toBe(1);
  });

  it('refuses unknown assets and customers', async () => {
    expect(await quoteAndSign({ ...aino, assetId: 'nope' })).toEqual({
      ok: false,
      reason: 'asset_not_found',
    });
    expect(await quoteAndSign({ ...aino, customerId: 'nobody' })).toEqual({
      ok: false,
      reason: 'unknown_customer',
    });
  });

  it('passes on pricing refusals, such as a down payment off the slider step', async () => {
    expect(await quoteAndSign({ ...aino, downPaymentCents: 1 })).toEqual({
      ok: false,
      reason: 'down_payment_off_step',
    });
  });
});

describe('signLease and the application', () => {
  it('signs only an approved application, deciding it again on the server', async () => {
    const { q_country: _country, ...incomplete } = ainoAnswers;
    expect(await quoteAndSign({ ...aino, answers: incomplete })).toEqual({
      ok: false,
      reason: 'application_incomplete',
    });
  });

  it('refuses a declined applicant (card 5: Mikko is 17)', async () => {
    expect(await quoteAndSign(mikko)).toEqual({
      ok: false,
      reason: 'application_declined',
    });
    expect(await db.contract.count()).toBe(0);
  });

  it('refuses to auto-sign an application that needs a person to review it', async () => {
    // PEP is only asked from 10 000 € financed: farm-008 is 12 900 € (1 290 000 cents).
    // A new applicant, not a persona: Aino's record says she is not a PEP.
    const { customerId: _persona, ...anonymous } = aino;
    const pep = {
      ...ainoAnswers,
      q_email: 'new.applicant@example.com',
      q_pep: 'yes',
      q_pep_details: 'Member of parliament',
    };
    const { q_usage_purpose: _usage, ...answers } = pep;
    expect(
      await quoteAndSign({
        ...anonymous,
        assetId: 'farm-008',
        answers: { ...answers, q_farm_registry: 'FR-1' },
      })
    ).toEqual({ ok: false, reason: 'application_needs_review' });
  });

  it('refuses an applicant who may not sign for their company (card 6)', async () => {
    expect(await quoteAndSign(norvi)).toEqual({
      ok: false,
      reason: 'signatory_must_sign',
    });
  });

  it('names a new applicant (not a data-pack persona) by their email', async () => {
    const { customerId: _persona, ...anonymous } = aino;
    const answers = { ...ainoAnswers, q_email: 'new.applicant@example.com' };
    const result = await quoteAndSign({ ...anonymous, answers });
    expect(result).toMatchObject({
      ok: true,
      contract: { customerId: 'email:new.applicant@example.com' },
    });
  });
});

describe('signLease and the named customer', () => {
  const nothingWritten = async () => {
    expect(await db.contract.count()).toBe(0);
    expect(await signingAudit()).toHaveLength(0);
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'laptop-008' } });
    expect(asset.status).toBe('available');
  };

  it('refuses Mikko with a changed birth date, and writes nothing (card 5)', async () => {
    // Born 1990 he would be approved; his record says 2009-03-10, so he is 17.
    const result = await quoteAndSign({
      ...mikko,
      answers: { ...mikko.answers, q_birth_date: '1990-03-10' },
    });
    expect(result).toEqual({
      ok: false,
      reason: 'answers_do_not_match_customer',
      questionIds: ['q_birth_date'],
    });
    await nothingWritten();
  });

  it('refuses Norvi saying the applicant can sign, and writes nothing (card 6)', async () => {
    const { q_signatory_email: _signatory, ...answers } = norviAnswers;
    expect(await quoteAndSign({ ...norvi, answers: { ...answers, q_can_sign: 'yes' } })).toEqual({
      ok: false,
      reason: 'answers_do_not_match_customer',
      questionIds: ['q_can_sign'],
    });
    expect(await db.contract.count()).toBe(0);
    expect(await signingAudit()).toHaveLength(0);
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-004' } });
    expect(asset.status).toBe('available');
  });

  it('still signs Aino with her own answers', async () => {
    expect((await quoteAndSign(aino)).ok).toBe(true);
  });

  it('lets a new applicant (no customer on record) give any answers', async () => {
    // With cust-aino named, this birth date would be refused (her record says 1997-04-12).
    const { customerId: _persona, ...anonymous } = aino;
    const answers = { ...ainoAnswers, q_birth_date: '1990-01-01' };
    expect(await quoteAndSign({ ...aino, answers })).toMatchObject({
      ok: false,
      reason: 'answers_do_not_match_customer',
    });
    const fresh = { ...answers, q_email: 'new.applicant@example.com' };
    expect(await quoteAndSign({ ...anonymous, answers: fresh })).toMatchObject({
      ok: true,
      contract: { customerId: 'email:new.applicant@example.com' },
    });
  });

  it("refuses an empty form with Mikko's email and a 1990 birth date (#30)", async () => {
    // No customerId: the email alone names Mikko, whose record says 2009-03-10 (D-040).
    const { customerId: _persona, ...emptyForm } = mikko;
    const answers = { ...mikko.answers, q_birth_date: '1990-03-10' };
    expect(await quoteAndSign({ ...emptyForm, answers })).toEqual({
      ok: false,
      reason: 'answers_do_not_match_customer',
      questionIds: ['q_birth_date'],
    });
    await nothingWritten();
  });

  it("refuses an empty form with Norvi's business ID under another email (#30)", async () => {
    const { customerId: _persona, ...emptyForm } = norvi;
    const { q_signatory_email: _signatory, ...rest } = norviAnswers;
    const answers = { ...rest, q_email: 'me@elsewhere.example.com', q_can_sign: 'yes' };
    expect(await quoteAndSign({ ...emptyForm, answers })).toEqual({
      ok: false,
      reason: 'answers_do_not_match_customer',
      questionIds: ['q_email', 'q_can_sign'],
    });
    expect(await db.contract.count()).toBe(0);
    expect(await signingAudit()).toHaveLength(0);
  });

  it("signs an empty form with Aino's own answers as Aino, not as an email (#30)", async () => {
    const { customerId: _persona, ...emptyForm } = aino;
    expect(await quoteAndSign(emptyForm)).toMatchObject({
      ok: true,
      contract: { customerId: 'cust-aino' },
    });
  });

  it('checks an unknown customer before the answers', async () => {
    expect(await quoteAndSign({ ...mikko, customerId: 'cust-nobody' })).toEqual({
      ok: false,
      reason: 'unknown_customer',
    });
    await nothingWritten();
  });
});

describe('getContract', () => {
  it('returns null for an id that does not exist', async () => {
    expect(await getContract(db, 999_999)).toBeNull();
  });

  it('treats a malformed stored contract as a server error, not a bad request', async () => {
    const row = await db.contract.create({
      data: {
        asset_id: 'ebike-003',
        customer_id: 'cust-aino',
        sign_date: '2026-11-05',
        start_date: '2026-11-05',
        terms_json: '{"assetId":"ebike-003","monthlyNetRentCents":"10730"}',
      },
    });
    await expect(getContract(db, row.id)).rejects.toThrow(CorruptRowError);
  });
});
