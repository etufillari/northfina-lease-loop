import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { listReviewApplications, reviewApplication } from './application-review';
import { withAudit } from './audit';

let fixture: Awaited<ReturnType<typeof createTestDb>>;

// Card 7: Haapalan Tila, farm-002, €145,000 with €20,000 down, PEP: a person must decide.
const farm = {
  id: 'farm-002',
  termMonths: 48,
  downPaymentCents: 2_000_000,
  name: 'Farm machine',
  category: 'farm_machine',
  available: true,
  priceCents: 14_500_000,
  priceListVersion: 1,
  monthlyNetCents: 300_000,
  monthlyTotalCents: 376_500,
  buyoutCents: 1_000_000,
  totalCents: 18_072_000,
};

beforeEach(async () => {
  fixture = await createTestDb();
  await withAudit(
    fixture.db,
    { actor: 'test', action: 'test.setup', entityType: 'test', entityId: 'setup' },
    async (tx) => {
      await tx.user.create({
        data: { id: 'owner', name: 'Haapalan Tila Oy', email: 'h@example.com' },
      });
      await tx.customer.create({ data: { id: 'cust-haapala', ownerUserId: 'owner' } });
      await tx.leaseApplication.create({
        data: {
          id: 'app-7',
          customerId: 'cust-haapala',
          startDate: '2026-11-06',
          status: 'manual_review',
          answersJson: '{}',
          reasonsJson: JSON.stringify(['pep', 'large_amount']),
          itemsJson: JSON.stringify([farm]),
        },
      });
    }
  );
});
afterEach(async () => {
  await fixture.cleanup();
});

describe('application review (card 7)', () => {
  it('lists the waiting application with its reasons and items', async () => {
    const [waiting] = await listReviewApplications(fixture.db);
    expect(waiting).toMatchObject({
      id: 'app-7',
      customerName: 'Haapalan Tila Oy',
      reasons: ['pep', 'large_amount'],
    });
    expect(waiting!.items[0]).toMatchObject({ id: 'farm-002', downPaymentCents: 2_000_000 });
  });

  it('approves once, with the note in the audit trail, and leaves the queue', async () => {
    await reviewApplication(fixture.db, {
      id: 'app-7',
      staffId: 'staff-1',
      decision: 'approve',
      note: 'PEP checked; revenue covers it.',
    });
    expect(
      (await fixture.db.leaseApplication.findUniqueOrThrow({ where: { id: 'app-7' } })).status
    ).toBe('approved');
    expect(await listReviewApplications(fixture.db)).toEqual([]);
    const audit = await fixture.db.auditLog.findFirstOrThrow({
      where: { action: 'application.reviewed' },
    });
    expect(audit.actor).toBe('staff-1');
    expect(JSON.parse(audit.details_json!)).toEqual({
      from: 'manual_review',
      to: 'approved',
      note: 'PEP checked; revenue covers it.',
    });
    // A second decision can't overwrite the first.
    await expect(
      reviewApplication(fixture.db, { id: 'app-7', staffId: 'x', decision: 'reject', note: 'No.' })
    ).rejects.toMatchObject({ code: 'NOT_IN_REVIEW' });
  });

  it('rejects', async () => {
    await reviewApplication(fixture.db, {
      id: 'app-7',
      staffId: 'staff-1',
      decision: 'reject',
      note: 'Beneficial owners not confirmed.',
    });
    expect(
      (await fixture.db.leaseApplication.findUniqueOrThrow({ where: { id: 'app-7' } })).status
    ).toBe('rejected');
  });
});
