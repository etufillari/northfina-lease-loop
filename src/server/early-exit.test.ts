// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { loadAssets, loadResidualCurves } from '@/data/load';
import { listAuditLog } from './audit';
import { seedAssets } from './assets';
import { getContractEnding } from './contract-endings';
import { getContract, signLease, type LeaseDataPack } from './contracts';
import { endLeaseEarly, type EarlyExitData } from './early-exit';
import { loadLeaseDataPack } from './lease-data';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: LeaseDataPack;
let exitData: EarlyExitData;
let contractId: number;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  data = await loadLeaseDataPack();
  exitData = {
    vatRates: data.vatRates,
    coefficientTable: data.coefficientTable,
    curves: await loadResidualCurves(),
  };
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.contractEnding.deleteMany();
  await db.contract.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
  // Card 1: Aino signs ebike-003 (new, 0 km) for 36 months on 5 Nov 2026.
  const signed = await signLease(db, data, {
    assetId: 'ebike-003',
    customerId: 'cust-aino',
    termMonths: 36,
    downPaymentCents: 0,
    answers: {
      q_customer_type: 'consumer',
      q_full_name: 'Aino Virtanen',
      q_birth_date: '1997-04-12',
      q_email: 'aino.virtanen@example.com',
      q_country: 'FI',
      q_employment: 'employed',
      q_monthly_income: 320_000,
      q_usage_purpose: 'commuting',
    },
    today: '2026-11-05',
    actor: 'cust-aino',
  });
  if (!signed.ok) throw new Error(`setup failed: ${signed.reason}`);
  contractId = signed.id;
});

const asset = () => db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });

describe('endLeaseEarly', () => {
  it('card 8: buys out in month 7, item sold, contract untouched, audited', async () => {
    const before = await getContract(db, contractId);
    const result = await endLeaseEarly(db, exitData, {
      contractId,
      choice: { kind: 'early_buy' },
      today: '2027-05-20',
      actor: 'cust-aino',
    });
    // Hand-worked in src/domain/early-exit.test.ts: 330 666 + 26 % VAT = 416 639.
    expect(result).toMatchObject({
      ok: true,
      ending: {
        kind: 'early_buy',
        effectiveDate: '2027-06-05',
        earlyExit: { exitMonth: 7, buy: { netCents: 330_666, grossCents: 416_639 } },
      },
    });
    expect(await asset()).toMatchObject({ status: 'sold', previous_lives: 1 });
    expect(await getContract(db, contractId)).toEqual(before);
    expect(await getContractEnding(db, contractId)).toEqual(result.ok && result.ending);
    const [audit] = await listAuditLog(db, 1);
    expect(audit).toMatchObject({ action: 'contract.ended_early_buy', actor: 'cust-aino' });
  });

  it('hands the item back with its inspection', async () => {
    const result = await endLeaseEarly(db, exitData, {
      contractId,
      choice: { kind: 'early_hand_back', condition: 'good', usageValue: 1_200 },
      today: '2027-05-20',
      actor: 'cust-aino',
    });
    // 282 427 + 48 239 − 259 230 = 71 436 (src/domain/early-exit.test.ts).
    expect(result).toMatchObject({
      ok: true,
      ending: { earlyExit: { handBack: { netCents: 71_436 } } },
    });
    expect(await asset()).toMatchObject({
      status: 'returned',
      condition: 'good',
      usage_value: 1_200,
    });
  });

  it('refuses after the term and a second ending, writing nothing', async () => {
    const late = await endLeaseEarly(db, exitData, {
      contractId,
      choice: { kind: 'early_buy' },
      today: '2029-11-05',
      actor: 'cust-aino',
    });
    expect(late).toEqual({ ok: false, reason: 'term_over' });
    expect(await getContractEnding(db, contractId)).toBeNull();
    expect((await asset()).status).toBe('reserved');

    const input = {
      contractId,
      choice: { kind: 'early_buy' } as const,
      today: '2027-05-20',
      actor: 'cust-aino',
    };
    await endLeaseEarly(db, exitData, input);
    expect(await endLeaseEarly(db, exitData, input)).toEqual({
      ok: false,
      reason: 'already_ended',
    });
  });

  it('refuses a missing contract', async () => {
    const result = await endLeaseEarly(db, exitData, {
      contractId: 999_999,
      choice: { kind: 'early_buy' },
      today: '2027-05-20',
      actor: 'x',
    });
    expect(result).toEqual({ ok: false, reason: 'contract_not_found' });
  });
});
