// Runs each real change against a real database, and listens the way a browser tab would.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AppNotification } from '@/domain/notifications';
import { ADMIN_ADDRESS, customerAddress } from '@/domain/notifications';
import {
  ainoEbikeAnswers,
  haapalaFarmAnswers,
  norviEbikeAnswers,
} from '../../../tests/helpers/applicants';
import { applyFor, findCustomer, resetLeaseData, signFor } from '../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../tests/helpers/test-db';
import { reviewApplication } from '../application/applications';
import { signContract } from '../contract/contracts';
import { setDemoDate } from '../date/app-date';
import { closeExpiredContracts, endContract } from '../end-of-term/contract-end';
import type { PrismaClient } from '../prisma-client';
import { releaseAsset, relistAsset } from '../second-life/relist';
import { subscribe } from './bus';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let stops: (() => void)[] = [];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetLeaseData(db);
});
afterEach(() => {
  stops.forEach((stop) => stop());
  stops = [];
});

function listen(address: string): AppNotification[] {
  const received: AppNotification[] = [];
  stops.push(subscribe([address], (notification) => received.push(notification)));
  return received;
}

const asCustomer = (id: string) => listen(customerAddress(id));

async function reachEndOfTerm() {
  const application = await applyFor(db, 'cust-aino', 'ebike-003', ainoEbikeAnswers);
  const contract = await signFor(db, 'cust-aino', application.id);
  await setDemoDate(db, { date: contract.planned_end_on, actor: 'test' });
  return contract;
}

const applyHaapala = () =>
  applyFor(db, 'cust-haapala', 'farm-002', haapalaFarmAnswers, {
    termMonths: 48,
    downPaymentCents: 2_000_000,
  });

describe('notifications', () => {
  it('tells the new person about a pass-on, and not the person who did it', async () => {
    const contract = await reachEndOfTerm();
    const jonas = asCustomer('cust-wait-02');
    const aino = asCustomer('cust-aino');

    await endContract(db, {
      contractId: contract.id,
      customer: await findCustomer('cust-aino'),
      outcome: 'passed_on',
      passedTo: 'cust-wait-02',
    });

    expect(jonas).toEqual([{ kind: 'passed_to_you', item: 'Nordvolt Trail 500' }]);
    expect(aino).toEqual([]);
  });

  it('tells nobody about a plain return', async () => {
    const contract = await reachEndOfTerm();
    const aino = asCustomer('cust-aino');

    await endContract(db, {
      contractId: contract.id,
      customer: await findCustomer('cust-aino'),
      outcome: 'returned',
    });

    expect(aino).toEqual([]);
  });

  it('tells the customer when their lease closes by itself', async () => {
    await reachEndOfTerm();
    const aino = asCustomer('cust-aino');

    await closeExpiredContracts(db, '2029-12-01');

    expect(aino).toEqual([{ kind: 'lease_closed', item: 'Nordvolt Trail 500' }]);
  });

  it('tells the person when their held item is ready', async () => {
    await db.asset.update({ where: { id: 'ebike-011' }, data: { reserved_for: 'cust-wait-02' } });
    const jonas = asCustomer('cust-wait-02');

    await relistAsset(db, {
      assetId: 'ebike-011',
      condition: 'good',
      usageValue: 22_100,
      actor: 'staff-dealer',
    });

    expect(jonas.map(({ kind }) => kind)).toEqual(['ready_for_you']);
  });

  it('tells nobody when a free item is re-listed', async () => {
    const jonas = asCustomer('cust-wait-02');

    await relistAsset(db, {
      assetId: 'ebike-011',
      condition: 'good',
      usageValue: 22_100,
      actor: 'staff-dealer',
    });

    expect(jonas).toEqual([]);
  });

  it('tells the person when their hold ends', async () => {
    await db.asset.update({ where: { id: 'ebike-002' }, data: { reserved_for: 'cust-wait-02' } });
    const jonas = asCustomer('cust-wait-02');

    await releaseAsset(db, { assetId: 'ebike-002', actor: 'staff-dealer' });

    expect(jonas.map(({ kind }) => kind)).toEqual(['hold_ended']);
  });

  it('tells admins about a new manual review case', async () => {
    const admins = listen(ADMIN_ADDRESS);

    await applyHaapala();

    expect(admins.map(({ kind }) => kind)).toEqual(['review_waiting']);
  });

  it('does not bother admins with an ordinary application', async () => {
    const admins = listen(ADMIN_ADDRESS);

    await applyFor(db, 'cust-aino', 'ebike-003', ainoEbikeAnswers);

    expect(admins).toEqual([]);
  });

  it.each([
    ['approved', 'application_approved'],
    ['rejected', 'application_rejected'],
  ] as const)('tells the applicant when a person %s their case', async (decision, kind) => {
    const application = await applyHaapala();
    const haapala = asCustomer('cust-haapala');

    await reviewApplication(db, { id: application.id, decision, actor: 'staff-admin' });

    expect(haapala.map((notification) => notification.kind)).toEqual([kind]);
  });

  it('tells the company when its signatory signs', async () => {
    const application = await applyFor(db, 'cust-norvi', 'ebike-004', norviEbikeAnswers);
    const norvi = asCustomer('cust-norvi');

    await signContract(db, {
      applicationId: application.id,
      customer: await findCustomer('cust-norvi'),
      signatoryId: 'sign-norvi-ceo',
    });

    expect(norvi.map(({ kind }) => kind)).toEqual(['contract_signed']);
  });

  it('tells nobody when a customer signs for themselves', async () => {
    const application = await applyFor(db, 'cust-aino', 'ebike-003', ainoEbikeAnswers);
    const aino = asCustomer('cust-aino');

    await signFor(db, 'cust-aino', application.id);

    expect(aino).toEqual([]);
  });
});
