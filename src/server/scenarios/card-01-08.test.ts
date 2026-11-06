// Cards 1 and 8 end to end on a real migrated database, through the services the routes call:
// Aino quotes ebike-003 for 36 months with no down payment on 2026-11-05, applies, signs the
// same day, pays seven rents on their due days and leaves in month 7 (2027-06-05). Card 8's
// market value is D31 (provisional): aged from the lease start, "good, 1 800 km".
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { contractBalanceOn } from '@/domain/invoicing';
import { signedContract, payRents } from '../../../tests/helpers/journey';
import { seedPack } from '../../../tests/helpers/invoice-fixture';
import { resetDb } from '../../../tests/helpers/reset-db';
import { createTestDb } from '../../../tests/helpers/test-db';
import { withProductionHandlers } from '../../../tests/helpers/with-handlers';
import { listAssetEvents, readPassport } from '../asset-events';
import { getAsset } from '../assets';
import { verifyAuditChain } from '../audit';
import { getContract } from '../contracts';
import { exitContract, previewExit } from '../exits';
import { listInvoices } from '../invoices';
import type { PrismaClient } from '../prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
});
withProductionHandlers();

const AINO = 'cust-aino';
const CARD_1 = { customerId: AINO, assetId: 'ebike-003', termMonths: 36, quoteOn: '2026-11-05' };
const MONTH_7 = '2027-06-05';
const GOOD_1800_KM = { condition: 'good' as const, usage: { unit: 'km' as const, value: 1_800 } };

describe('card 1: the happy path, signed through the services', () => {
  it('quote → approved → signed: 36 rents, 13 466 then 13 520 from January, the asset leased', async () => {
    const { application, contract } = await signedContract(db, CARD_1);
    expect(application.decision).toBe('approved');
    expect(contract).toMatchObject({
      status: 'active',
      startDate: '2026-11-05',
      endDate: '2029-11-04',
      monthlyNetCents: 10_730,
    });

    const invoices = await listInvoices(db, contract.id);
    expect(invoices).toHaveLength(36);
    expect(invoices.every((i) => i.kind === 'rent')).toBe(true);
    expect(invoices.find((i) => i.sequence === 0)).toBeUndefined();
    expect(invoices.slice(0, 2).map((i) => i.grossCents)).toEqual([13_466, 13_466]);
    const january = invoices.find((i) => i.issueDate === '2027-01-05');
    expect(january).toMatchObject({ sequence: 3, vatRateBasisPoints: 2_600, grossCents: 13_520 });

    // On the signing day the first rent is open and not yet overdue; the rest are upcoming.
    const balance = contractBalanceOn(invoices, {}, '2026-11-05');
    expect(balance).toMatchObject({ openCents: 13_466, overdueCents: 0, paidCents: 0 });

    expect((await getAsset(db, 'ebike-003'))?.status).toBe('leased');
    const passport = await readPassport(db, 'ebike-003', '2026-11-05');
    expect(passport?.passport.lives.at(-1)).toMatchObject({ estimated: false });
    expect((await listAssetEvents(db, 'ebike-003')).map((e) => e.kind)).toEqual(['leased']);

    expect(await verifyAuditChain(db)).toMatchObject({ ok: true });
  });
});

describe('card 8: the early exit in month 7 (D14, D31 provisional)', () => {
  it('seven rents paid, preview buy 330 675 and return 75 945 as coded lines, then a buy', async () => {
    // Step 1: card 1, then seven rents paid on their due days.
    const { contract } = await signedContract(db, CARD_1);
    await payRents(db, contract.id, 7, AINO);
    const paid = contractBalanceOn(await listInvoices(db, contract.id), {}, MONTH_7);
    expect(paid.paidCents).toBe(2 * 13_466 + 5 * 13_520);

    // Step 2: the preview writes nothing and explains itself in codes, never in sentences.
    const auditBefore = await db.auditLog.count();
    const preview = await previewExit(
      db,
      { contractId: contract.id, mode: 'buy', reported: GOOD_1800_KM },
      MONTH_7
    );
    if (!preview.ok) throw new Error(preview.reason.code);
    expect(preview.preview.monthsPaid).toBe(7);
    expect(preview.preview.buy.totalCents).toBe(330_675);
    expect(preview.preview.return.totalCents).toBe(75_945);
    for (const line of [...preview.preview.buy.lines, ...preview.preview.return.lines]) {
      expect(line.code).toMatch(/^[a-z_]+$/);
    }
    expect(preview.preview.buy.lines.at(-1)).toMatchObject({
      code: 'total',
      params: { amountCents: 330_675 },
    });
    expect(preview.preview.return.lines.map((l) => l.code)).toContain('market_value');
    expect(await db.auditLog.count()).toBe(auditBefore);

    // Step 3: the buy.
    const bought = await exitContract(
      db,
      { contractId: contract.id, mode: 'buy', reported: GOOD_1800_KM, actor: AINO },
      MONTH_7
    );
    if (!bought.ok) throw new Error(bought.reason.code);
    expect(await getContract(db, contract.id)).toMatchObject({
      status: 'ended_early',
      endedOn: MONTH_7,
    });
    const invoices = await listInvoices(db, contract.id);
    const rents = invoices.filter((i) => i.kind === 'rent');
    expect(rents.filter((i) => i.status === 'paid')).toHaveLength(7);
    expect(rents.filter((i) => i.status === 'cancelled')).toHaveLength(29);
    const exit = invoices.filter((i) => i.kind === 'early_exit');
    expect(exit).toHaveLength(1);
    expect(exit[0]).toMatchObject({
      netCents: 330_675,
      vatRateBasisPoints: 2_600,
      vatCents: 85_976,
      grossCents: 416_651,
      dueDate: MONTH_7,
    });
    expect((await getAsset(db, 'ebike-003'))?.status).toBe('sold');
    expect((await listAssetEvents(db, 'ebike-003')).map((e) => e.kind)).toEqual([
      'leased',
      'bought',
    ]);
    expect(await verifyAuditChain(db)).toMatchObject({ ok: true });

    // Step 4: a second exit is refused and writes nothing.
    const auditAfter = await db.auditLog.count();
    const again = await exitContract(
      db,
      { contractId: contract.id, mode: 'return', reported: GOOD_1800_KM, actor: AINO },
      MONTH_7
    );
    expect(again).toMatchObject({ ok: false, reason: { code: 'contract_not_active' } });
    expect(await db.auditLog.count()).toBe(auditAfter);
  });
});
