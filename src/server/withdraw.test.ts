// D87 on a real migrated SQLite database: the applicant withdraws an application that is not a
// lease yet; the row, its reason and the audit row commit together, a withdrawn application
// can no longer be signed or reviewed, and every refusal writes nothing.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PricingData } from '@/domain/pricing';
import { seedPack } from '../../tests/helpers/invoice-fixture';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import { withProductionHandlers } from '../../tests/helpers/with-handlers';
import { decideApplication, getApplication, withdrawApplication } from './applications';
import { signContract } from './contracts';
import type { PrismaClient } from './prisma-client';
import { createQuote, loadPricingData } from './quotes';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: PricingData;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  data = await loadPricingData();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
});
withProductionHandlers();

const TODAY = '2026-11-05';

/** Card 1's quote and an application in `decision` for Aino, written directly. */
async function application(decision: string): Promise<string> {
  const quote = await createQuote(
    db,
    { assetId: 'ebike-003', termMonths: 36, downPaymentCents: 0, today: TODAY, actor: 'cust-aino' },
    data
  );
  if (!quote.ok) throw new Error(quote.reason.code);
  const row = await db.application.create({
    data: {
      customer_id: 'cust-aino',
      quote_id: quote.quote.id,
      answers_json: '{}',
      decision,
      reasons_json: JSON.stringify([{ code: 'all_checks_passed', params: {} }]),
      decided_on: TODAY,
    },
  });
  return row.id;
}

const withdrawnRows = () => db.auditLog.count({ where: { action: 'application.withdrawn' } });

describe('withdrawApplication (D87)', () => {
  it('Aino withdraws her approved, unsigned card 1 application: withdrawn, with a reason and an audit row', async () => {
    const id = await application('approved');
    const result = await withdrawApplication(db, { id, actor: 'cust-aino', today: '2026-11-06' });
    expect(result.ok).toBe(true);
    expect(await getApplication(db, id)).toMatchObject({
      decision: 'withdrawn',
      decidedOn: '2026-11-06',
      reasons: [
        { code: 'all_checks_passed', params: {} },
        { code: 'withdrawn', params: { by: 'cust-aino', on: '2026-11-06' } },
      ],
    });
    expect(
      await db.auditLog.findFirst({ where: { action: 'application.withdrawn', entity_id: id } })
    ).toMatchObject({ actor: 'cust-aino' });
  });

  it('a withdrawn application can no longer be signed', async () => {
    const id = await application('approved');
    await withdrawApplication(db, { id, actor: 'cust-aino', today: TODAY });
    const signed = await signContract(db, { applicationId: id, actor: 'cust-aino' }, TODAY, data);
    expect(signed).toMatchObject({
      ok: false,
      reason: { code: 'application_not_approved', params: { decision: 'withdrawn' } },
    });
    expect(await db.contract.count()).toBe(0);
  });

  it('a manual review withdrawn before the admin decides is no longer the admin’s to decide', async () => {
    const id = await application('manual_review');
    expect((await withdrawApplication(db, { id, actor: 'cust-aino', today: TODAY })).ok).toBe(true);
    const decided = await decideApplication(db, {
      id,
      decision: 'approved',
      reviewedBy: 'admin',
      today: TODAY,
      actor: 'admin',
    });
    expect(decided).toEqual({ ok: false, reason: 'not_pending' });
  });

  it('the admin may withdraw for the customer; the audit row names the admin', async () => {
    const id = await application('awaiting_signatory');
    expect((await withdrawApplication(db, { id, actor: 'admin', today: TODAY })).ok).toBe(true);
    expect(
      await db.auditLog.findFirst({ where: { action: 'application.withdrawn', entity_id: id } })
    ).toMatchObject({ actor: 'admin' });
  });

  it('a signed application is a lease: refused with already_signed, nothing written', async () => {
    const id = await application('approved');
    const signed = await signContract(db, { applicationId: id, actor: 'cust-aino' }, TODAY, data);
    expect(signed.ok).toBe(true);
    const result = await withdrawApplication(db, { id, actor: 'cust-aino', today: TODAY });
    expect(result).toMatchObject({
      ok: false,
      reason: 'refused',
      refusal: { code: 'already_signed' },
    });
    expect(await withdrawnRows()).toBe(0);
    expect((await getApplication(db, id))?.decision).toBe('approved');
  });

  it.each(['rejected', 'withdrawn'])('a %s application is final: not_withdrawable', async (d) => {
    const id = await application(d);
    const result = await withdrawApplication(db, { id, actor: 'cust-aino', today: TODAY });
    expect(result).toMatchObject({
      ok: false,
      reason: 'refused',
      refusal: { code: 'not_withdrawable', params: { decision: d } },
    });
    expect(await withdrawnRows()).toBe(0);
  });

  it('another customer is refused before anything is read (D73), and anonymous too', async () => {
    const id = await application('approved');
    expect(await withdrawApplication(db, { id, actor: 'cust-mikko', today: TODAY })).toMatchObject({
      ok: false,
      reason: 'forbidden',
      refusal: { code: 'not_owner' },
    });
    expect(await withdrawApplication(db, { id, actor: 'anonymous', today: TODAY })).toMatchObject({
      ok: false,
      reason: 'forbidden',
      refusal: { code: 'not_signed_in' },
    });
    expect(await withdrawnRows()).toBe(0);
  });

  it('an unknown application is not_found', async () => {
    expect(
      await withdrawApplication(db, { id: 'no-such-id', actor: 'admin', today: TODAY })
    ).toEqual({ ok: false, reason: 'not_found' });
  });
});
