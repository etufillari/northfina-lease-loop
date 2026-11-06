import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { toAssetRowData } from './assets';
import { withAudit } from './audit';
import { billingActor, issueDueInvoices } from './invoice-issuance';

let fixture: Awaited<ReturnType<typeof createTestDb>>;

// Scenario card 1's lease, as checkout writes it: ebike-003, 36 months from 5 Nov 2026.
const contract = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  customerId: 'customer',
  assetId: 'ebike-003',
  startDate: '2026-11-05',
  termMonths: 36,
  listPriceCents: 389000,
  downPaymentCents: 0,
  monthlyNetCents: 10730,
  buyoutCents: 58350,
  priceListVersion: 1,
  ...overrides,
});

beforeEach(async () => {
  fixture = await createTestDb();
  const asset = (await loadAssets()).find((item) => item.id === 'ebike-003')!;
  await withAudit(
    fixture.db,
    { actor: 'test', action: 'test.setup', entityType: 'asset', entityId: asset.id },
    async (tx) => {
      await tx.asset.create({ data: toAssetRowData(asset) });
      await tx.user.create({ data: { id: 'owner', name: 'Owner', email: 'owner@example.com' } });
      await tx.customer.create({ data: { id: 'customer', ownerUserId: 'owner' } });
    }
  );
});

afterEach(async () => {
  await fixture.cleanup();
});

const invoices = () =>
  fixture.db.invoice.findMany({ orderBy: { dueDate: 'asc' }, include: { payments: true } });
const billingRuns = () => fixture.db.auditLog.findMany({ where: { actor: billingActor } });

describe('issueDueInvoices', () => {
  it('issues card 1 from the locked contract with VAT per due date, once', async () => {
    await fixture.db.contract.create({ data: contract('real') });
    expect(await issueDueInvoices(fixture.db, 'customer', '2027-01-05')).toBe(3);
    const rows = await invoices();
    expect(
      rows.map(({ dueDate, issuedDate, netCents, vatBasisPoints, vatCents, status }) => ({
        dueDate,
        issuedDate,
        netCents,
        vatBasisPoints,
        vatCents,
        status,
      }))
    ).toEqual(
      [
        ['2026-11-05', 2550, 2736],
        ['2026-12-05', 2550, 2736],
        ['2027-01-05', 2600, 2790],
      ].map(([dueDate, vatBasisPoints, vatCents]) => ({
        dueDate,
        issuedDate: dueDate,
        netCents: 10730,
        vatBasisPoints,
        vatCents,
        status: 'issued',
      }))
    );
    // A real lease is never paid by the billing run.
    expect(rows.every((row) => row.payments.length === 0)).toBe(true);

    // Running again (another page view) creates nothing and writes no audit row.
    expect(await issueDueInvoices(fixture.db, 'customer', '2027-01-05')).toBe(0);
    expect(await invoices()).toHaveLength(3);
    const runs = await billingRuns();
    expect(runs).toHaveLength(1);
    expect(JSON.parse(runs[0]!.details_json!)).toMatchObject({
      today: '2027-01-05',
      invoices: [
        { contractId: 'real', dueDate: '2026-11-05' },
        { contractId: 'real', dueDate: '2026-12-05' },
        { contractId: 'real', dueDate: '2027-01-05' },
      ],
    });

    // A month later only the new month is issued.
    expect(await issueDueInvoices(fixture.db, 'customer', '2027-02-05')).toBe(1);
    expect(await billingRuns()).toHaveLength(2);
  });

  it('records a simulated payment for past-due invoices on demo leases', async () => {
    await fixture.db.contract.create({ data: contract('demo', { isDemo: true }) });
    await issueDueInvoices(fixture.db, 'customer', '2026-12-05');
    const rows = await invoices();
    expect(rows.map((row) => row.payments.map((payment) => payment.isSimulated))).toEqual([
      [true],
      [],
    ]);
    expect(rows[0]!.payments[0]).toMatchObject({ amountCents: 13466, paidDate: '2026-11-05' });
  });

  it('bills nothing for a contract still waiting for its signatory, or already ended', async () => {
    await fixture.db.contract.create({
      data: contract('waiting', { status: 'awaiting_signature' }),
    });
    expect(await issueDueInvoices(fixture.db, 'customer', '2027-01-05')).toBe(0);
    expect(await billingRuns()).toHaveLength(0);
    await fixture.db.contract.update({ where: { id: 'waiting' }, data: { status: 'returned' } });
    expect(await issueDueInvoices(fixture.db, 'customer', '2027-01-05')).toBe(0);
  });

  it("only bills the given customer's contracts", async () => {
    await fixture.db.contract.create({ data: contract('real') });
    expect(await issueDueInvoices(fixture.db, 'someone-else', '2027-01-05')).toBe(0);
    expect(await invoices()).toHaveLength(0);
  });
});
