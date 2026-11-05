import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { submitApplication } from './applications';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.auditLog.deleteMany();
});

describe('submitApplication', () => {
  it('creates an application submission and writes an audit log row', async () => {
    const result = await submitApplication(db, {
      assetId: 'laptop-001',
      termMonths: 24,
      monthlyRentCents: 8500,
      answers: {
        q_customer_type: 'consumer',
        q_full_name: 'Aino Virtanen',
      },
      actor: 'cust-aino',
    });

    expect(result).toMatchObject({
      status: 'received',
      assetId: 'laptop-001',
      termMonths: 24,
      monthlyRentCents: 8500,
      answers: {
        q_customer_type: 'consumer',
        q_full_name: 'Aino Virtanen',
      },
    });
    expect(result.id).toMatch(/^app-/);

    const audit = await db.auditLog.findFirstOrThrow();
    expect(audit).toMatchObject({
      actor: 'cust-aino',
      action: 'application.submitted',
      entity_type: 'application',
      entity_id: result.id,
    });

    const details = JSON.parse(audit.details_json ?? '{}');
    expect(details).toMatchObject({
      assetId: 'laptop-001',
      termMonths: 24,
      monthlyRentCents: 8500,
      answersCount: 2,
    });
  });

  it('uses default values when optional parameters are omitted', async () => {
    const result = await submitApplication(db, {
      answers: {},
    });

    expect(result).toMatchObject({
      status: 'received',
      assetId: 'ebike-003',
      termMonths: 36,
      monthlyRentCents: 10730,
      answers: {},
    });

    const audit = await db.auditLog.findFirstOrThrow();
    expect(audit.actor).toBe('applicant');
  });
});
