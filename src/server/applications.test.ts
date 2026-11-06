import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import type { PrismaClient } from './prisma-client';
import { submitApplication } from './applications';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.application.deleteMany();
  await db.auditLog.deleteMany();
});

describe('submitApplication', () => {
  it('stores the server decision and writes an audit row', async () => {
    const application = await submitApplication(db, {
      answers: {
        q_customer_type: 'consumer',
        q_birth_date: '1990-01-01',
        q_country: 'FI',
      },
      category: 'laptop',
      financedAmountCents: 30_000,
      contractStartDate: '2026-11-06',
      customerId: 'cust-aino',
      actor: 'cust-aino',
    });

    expect(application.decisionResult).toEqual({ decision: 'approved', reasons: [] });
    expect(await db.application.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'application.submitted' } })).toBe(1);

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'application.submitted' },
    });
    expect(audit.entity_id).toBe(application.id);
    expect(JSON.parse(audit.details_json ?? '{}')).toMatchObject({
      decision: 'approved',
      customerId: 'cust-aino',
    });
  });

  it('recalculates a declined decision on the server', async () => {
    const application = await submitApplication(db, {
      answers: {
        q_customer_type: 'consumer',
        q_birth_date: '2008-11-07',
        q_country: 'FI',
      },
      category: 'laptop',
      financedAmountCents: 30_000,
      contractStartDate: '2026-11-06',
      actor: 'applicant',
    });

    expect(application.decisionResult).toEqual({
      decision: 'declined',
      reasons: ['under_minimum_age'],
    });
    expect(
      JSON.parse(
        (await db.application.findUniqueOrThrow({ where: { id: application.id } })).reasons_json
      )
    ).toEqual(['under_minimum_age']);
  });
});
